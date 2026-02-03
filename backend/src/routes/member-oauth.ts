import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, members, branches, memberSocialAccounts } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { memberAuthMiddleware, requireMember, rateLimiter } from '../middleware/index.js';
import type { MemberVariables } from '../middleware/index.js';
import { memberJwtService } from '../services/member-jwt.js';

// =============================================================================
// MEMBER OAUTH ROUTES
// =============================================================================
// Social login (Google, LINE, Apple) for member-app
// Endpoints: /:provider/init, /:provider/callback, /link, /:provider (DELETE)

const app = new Hono<{ Variables: MemberVariables }>();

// -----------------------------------------------------------------------------
// OAuth Provider Configuration
// -----------------------------------------------------------------------------

type OAuthProvider = 'google' | 'line' | 'apple';

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
}

function getOAuthConfig(provider: OAuthProvider): OAuthConfig | null {
  const baseRedirectUri = process.env.MEMBER_APP_URL || 'http://localhost:3000';

  switch (provider) {
    case 'google':
      return {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirectUri: `${baseRedirectUri}/auth/callback/google`,
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
        scope: 'email profile',
      };

    case 'line':
      return {
        clientId: process.env.LINE_CHANNEL_ID || '',
        clientSecret: process.env.LINE_CHANNEL_SECRET || '',
        redirectUri: `${baseRedirectUri}/auth/callback/line`,
        authUrl: 'https://access.line.me/oauth2/v2.1/authorize',
        tokenUrl: 'https://api.line.me/oauth2/v2.1/token',
        userInfoUrl: 'https://api.line.me/v2/profile',
        scope: 'profile openid email',
      };

    case 'apple':
      return {
        clientId: process.env.APPLE_CLIENT_ID || '',
        clientSecret: process.env.APPLE_CLIENT_SECRET || '', // Generated from private key
        redirectUri: `${baseRedirectUri}/auth/callback/apple`,
        authUrl: 'https://appleid.apple.com/auth/authorize',
        tokenUrl: 'https://appleid.apple.com/auth/token',
        userInfoUrl: '', // Apple returns user info in ID token
        scope: 'name email',
      };

    default:
      return null;
  }
}

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const providerParamSchema = z.object({
  provider: z.enum(['google', 'line', 'apple']),
});

const callbackSchema = z.object({
  code: z.string().min(1, '請提供授權碼'),
  state: z.string().optional(),
  // Apple specific
  id_token: z.string().optional(),
  user: z.string().optional(), // Apple returns user info as JSON string on first auth
});

const linkAccountSchema = z.object({
  provider: z.enum(['google', 'line', 'apple']),
  code: z.string().min(1, '請提供授權碼'),
  state: z.string().optional(),
});

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  idToken?: string;
}

interface OAuthUserInfo {
  id: string;
  email?: string;
  name?: string;
  picture?: string;
}

async function exchangeCodeForTokens(provider: OAuthProvider, code: string): Promise<OAuthTokens | null> {
  const config = getOAuthConfig(provider);
  if (!config || !config.clientId) {
    return null;
  }

  try {
    const params = new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    });

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      console.error(`[OAuth] Token exchange failed for ${provider}:`, await response.text());
      return null;
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      id_token?: string;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      idToken: data.id_token,
    };
  } catch (error) {
    console.error(`[OAuth] Token exchange error for ${provider}:`, error);
    return null;
  }
}

async function getUserInfo(provider: OAuthProvider, accessToken: string, idToken?: string): Promise<OAuthUserInfo | null> {
  const config = getOAuthConfig(provider);
  if (!config) {
    return null;
  }

  try {
    if (provider === 'apple' && idToken) {
      // Decode Apple ID token (JWT)
      const [, payloadBase64] = idToken.split('.');
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
      return {
        id: payload.sub,
        email: payload.email,
        name: undefined, // Apple only sends name on first auth
      };
    }

    const response = await fetch(config.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error(`[OAuth] User info fetch failed for ${provider}:`, await response.text());
      return null;
    }

    const data = await response.json() as Record<string, unknown>;

    if (provider === 'google') {
      return {
        id: data.id as string,
        email: data.email as string | undefined,
        name: data.name as string | undefined,
        picture: data.picture as string | undefined,
      };
    }

    if (provider === 'line') {
      return {
        id: data.userId as string,
        email: undefined, // LINE doesn't always return email
        name: data.displayName as string | undefined,
        picture: data.pictureUrl as string | undefined,
      };
    }

    return null;
  } catch (error) {
    console.error(`[OAuth] User info error for ${provider}:`, error);
    return null;
  }
}

function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

// State storage (in production, use Redis or database)
const stateStore = new Map<string, { createdAt: number; redirect?: string }>();

// Clean up old states periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of stateStore.entries()) {
    if (now - value.createdAt > 10 * 60 * 1000) { // 10 minutes
      stateStore.delete(key);
    }
  }
}, 60 * 1000);

// -----------------------------------------------------------------------------
// GET /api/member/oauth/:provider/init - Start OAuth flow
// -----------------------------------------------------------------------------

app.get(
  '/:provider/init',
  zValidator('param', providerParamSchema),
  async (c) => {
    const { provider } = c.req.valid('param');
    const redirect = c.req.query('redirect');

    const config = getOAuthConfig(provider);

    if (!config || !config.clientId) {
      return c.json({
        success: false,
        error: `${provider} 登入尚未設定`,
        code: 'OAUTH_NOT_CONFIGURED',
      }, 400);
    }

    // Generate and store state
    const state = generateState();
    stateStore.set(state, { createdAt: Date.now(), redirect });

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: config.scope,
      state,
    });

    // Provider-specific params
    if (provider === 'line') {
      params.set('bot_prompt', 'normal');
    } else if (provider === 'apple') {
      params.set('response_mode', 'form_post');
    }

    const authUrl = `${config.authUrl}?${params.toString()}`;

    return c.json({
      success: true,
      data: {
        authUrl,
        state,
      },
    });
  }
);

// -----------------------------------------------------------------------------
// POST /api/member/oauth/:provider/callback - Handle OAuth callback
// -----------------------------------------------------------------------------

app.post(
  '/:provider/callback',
  rateLimiter({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 100 : 10,
  }),
  zValidator('param', providerParamSchema),
  zValidator('json', callbackSchema),
  async (c) => {
    const { provider } = c.req.valid('param');
    const { code, state, user: appleUser } = c.req.valid('json');

    // Verify state
    if (state) {
      const storedState = stateStore.get(state);
      if (!storedState) {
        return c.json({
          success: false,
          error: '授權狀態無效或已過期',
          code: 'INVALID_STATE',
        }, 400);
      }
      stateStore.delete(state);
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(provider, code);

    if (!tokens) {
      return c.json({
        success: false,
        error: '授權失敗，請重試',
        code: 'TOKEN_EXCHANGE_FAILED',
      }, 400);
    }

    // Get user info
    let userInfo = await getUserInfo(provider, tokens.accessToken, tokens.idToken);

    // For Apple first-time auth, user info may come from form post
    if (provider === 'apple' && appleUser) {
      try {
        const appleUserData = JSON.parse(appleUser);
        if (!userInfo) userInfo = { id: '' };
        userInfo.name = appleUserData.name
          ? `${appleUserData.name.firstName || ''} ${appleUserData.name.lastName || ''}`.trim()
          : undefined;
        userInfo.email = appleUserData.email || userInfo.email;
      } catch {
        // Ignore parse errors
      }
    }

    if (!userInfo || !userInfo.id) {
      return c.json({
        success: false,
        error: '無法取得用戶資訊',
        code: 'USER_INFO_FAILED',
      }, 400);
    }

    // Find existing social account
    const [existingSocial] = await db
      .select({
        id: memberSocialAccounts.id,
        memberId: memberSocialAccounts.memberId,
      })
      .from(memberSocialAccounts)
      .where(and(
        eq(memberSocialAccounts.provider, provider),
        eq(memberSocialAccounts.providerUserId, userInfo.id),
      ))
      .limit(1);

    if (existingSocial) {
      // Update tokens
      await db
        .update(memberSocialAccounts)
        .set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: tokens.expiresIn
            ? new Date(Date.now() + tokens.expiresIn * 1000)
            : null,
          updatedAt: new Date(),
        })
        .where(eq(memberSocialAccounts.id, existingSocial.id));

      // Get member
      const [member] = await db
        .select({
          id: members.id,
          memberCode: members.memberCode,
          fullName: members.fullName,
          branchId: members.branchId,
          tenantId: members.tenantId,
          status: members.status,
        })
        .from(members)
        .where(eq(members.id, existingSocial.memberId))
        .limit(1);

      if (!member) {
        return c.json({
          success: false,
          error: '會員不存在',
          code: 'MEMBER_NOT_FOUND',
        }, 404);
      }

      if (member.status === 'BANNED') {
        return c.json({
          success: false,
          error: '帳號已停權',
          code: 'MEMBER_BANNED',
        }, 403);
      }

      // Get branch for tenantId
      const [branch] = await db
        .select({ tenantId: branches.tenantId, name: branches.name })
        .from(branches)
        .where(eq(branches.id, member.branchId))
        .limit(1);

      // Generate tokens
      const memberTokens = memberJwtService.generateTokens({
        id: member.id,
        memberCode: member.memberCode,
        branchId: member.branchId,
        tenantId: member.tenantId || branch?.tenantId || '',
      });

      return c.json({
        success: true,
        data: {
          isNewMember: false,
          accessToken: memberTokens.accessToken,
          refreshToken: memberTokens.refreshToken,
          expiresIn: memberTokens.expiresIn,
          member: {
            id: member.id,
            memberCode: member.memberCode,
            fullName: member.fullName,
            status: member.status,
          },
          branch: branch ? { name: branch.name } : null,
        },
      });
    }

    // Try to find member by email
    if (userInfo.email) {
      const [memberByEmail] = await db
        .select({
          id: members.id,
          memberCode: members.memberCode,
          fullName: members.fullName,
          branchId: members.branchId,
          tenantId: members.tenantId,
          status: members.status,
        })
        .from(members)
        .where(eq(members.email, userInfo.email))
        .limit(1);

      if (memberByEmail) {
        // Link social account to existing member
        await db.insert(memberSocialAccounts).values({
          memberId: memberByEmail.id,
          provider,
          providerUserId: userInfo.id,
          email: userInfo.email,
          displayName: userInfo.name,
          avatarUrl: userInfo.picture,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: tokens.expiresIn
            ? new Date(Date.now() + tokens.expiresIn * 1000)
            : null,
          rawProfile: userInfo as unknown as Record<string, unknown>,
        });

        if (memberByEmail.status === 'BANNED') {
          return c.json({
            success: false,
            error: '帳號已停權',
            code: 'MEMBER_BANNED',
          }, 403);
        }

        // Get branch for tenantId
        const [branch] = await db
          .select({ tenantId: branches.tenantId, name: branches.name })
          .from(branches)
          .where(eq(branches.id, memberByEmail.branchId))
          .limit(1);

        // Generate tokens
        const memberTokens = memberJwtService.generateTokens({
          id: memberByEmail.id,
          memberCode: memberByEmail.memberCode,
          branchId: memberByEmail.branchId,
          tenantId: memberByEmail.tenantId || branch?.tenantId || '',
        });

        return c.json({
          success: true,
          data: {
            isNewMember: false,
            isNewLink: true,
            accessToken: memberTokens.accessToken,
            refreshToken: memberTokens.refreshToken,
            expiresIn: memberTokens.expiresIn,
            member: {
              id: memberByEmail.id,
              memberCode: memberByEmail.memberCode,
              fullName: memberByEmail.fullName,
              status: memberByEmail.status,
            },
            branch: branch ? { name: branch.name } : null,
          },
        });
      }
    }

    // No existing member found - return social info for registration
    return c.json({
      success: true,
      data: {
        isNewMember: true,
        needsRegistration: true,
        socialInfo: {
          provider,
          providerUserId: userInfo.id,
          email: userInfo.email,
          displayName: userInfo.name,
          avatarUrl: userInfo.picture,
        },
        tempToken: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
      },
    });
  }
);

// -----------------------------------------------------------------------------
// POST /api/member/oauth/link - Link social account (authenticated)
// -----------------------------------------------------------------------------

app.post(
  '/link',
  memberAuthMiddleware,
  requireMember,
  rateLimiter({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 100 : 5,
  }),
  zValidator('json', linkAccountSchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const { provider, code } = c.req.valid('json');

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(provider, code);

    if (!tokens) {
      return c.json({
        success: false,
        error: '授權失敗，請重試',
        code: 'TOKEN_EXCHANGE_FAILED',
      }, 400);
    }

    // Get user info
    const userInfo = await getUserInfo(provider, tokens.accessToken, tokens.idToken);

    if (!userInfo || !userInfo.id) {
      return c.json({
        success: false,
        error: '無法取得用戶資訊',
        code: 'USER_INFO_FAILED',
      }, 400);
    }

    // Check if this social account is already linked to another member
    const [existingSocial] = await db
      .select({
        id: memberSocialAccounts.id,
        memberId: memberSocialAccounts.memberId,
      })
      .from(memberSocialAccounts)
      .where(and(
        eq(memberSocialAccounts.provider, provider),
        eq(memberSocialAccounts.providerUserId, userInfo.id),
      ))
      .limit(1);

    if (existingSocial) {
      if (existingSocial.memberId === memberInfo.id) {
        // Already linked to this member
        return c.json({
          success: false,
          error: '此帳號已連結',
          code: 'ALREADY_LINKED',
        }, 400);
      } else {
        // Linked to different member
        return c.json({
          success: false,
          error: '此社交帳號已連結至其他會員',
          code: 'LINKED_TO_OTHER',
        }, 400);
      }
    }

    // Check if member already has this provider linked
    const [existingForMember] = await db
      .select({ id: memberSocialAccounts.id })
      .from(memberSocialAccounts)
      .where(and(
        eq(memberSocialAccounts.memberId, memberInfo.id),
        eq(memberSocialAccounts.provider, provider),
      ))
      .limit(1);

    if (existingForMember) {
      return c.json({
        success: false,
        error: `您已經連結了一個 ${provider} 帳號`,
        code: 'PROVIDER_ALREADY_LINKED',
      }, 400);
    }

    // Link social account
    await db.insert(memberSocialAccounts).values({
      memberId: memberInfo.id,
      provider,
      providerUserId: userInfo.id,
      email: userInfo.email,
      displayName: userInfo.name,
      avatarUrl: userInfo.picture,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresIn
        ? new Date(Date.now() + tokens.expiresIn * 1000)
        : null,
      rawProfile: userInfo as unknown as Record<string, unknown>,
    });

    return c.json({
      success: true,
      message: `已成功連結 ${provider} 帳號`,
      data: {
        provider,
        email: userInfo.email,
        displayName: userInfo.name,
      },
    });
  }
);

// -----------------------------------------------------------------------------
// DELETE /api/member/oauth/:provider - Unlink social account
// -----------------------------------------------------------------------------

app.delete(
  '/:provider',
  memberAuthMiddleware,
  requireMember,
  zValidator('param', providerParamSchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const { provider } = c.req.valid('param');

    // Find the social account
    const [socialAccount] = await db
      .select({ id: memberSocialAccounts.id })
      .from(memberSocialAccounts)
      .where(and(
        eq(memberSocialAccounts.memberId, memberInfo.id),
        eq(memberSocialAccounts.provider, provider),
      ))
      .limit(1);

    if (!socialAccount) {
      return c.json({
        success: false,
        error: '未找到此社交帳號連結',
        code: 'NOT_FOUND',
      }, 404);
    }

    // Check if member has other login methods
    // (at least one: password, OTP via phone, or another social account)
    const socialAccounts = await db
      .select({ id: memberSocialAccounts.id })
      .from(memberSocialAccounts)
      .where(eq(memberSocialAccounts.memberId, memberInfo.id));

    if (socialAccounts.length <= 1) {
      // Check if member has phone for OTP
      const [member] = await db
        .select({ phone: members.phone })
        .from(members)
        .where(eq(members.id, memberInfo.id))
        .limit(1);

      if (!member?.phone) {
        return c.json({
          success: false,
          error: '無法取消連結，請先設定其他登入方式',
          code: 'NO_OTHER_LOGIN_METHOD',
        }, 400);
      }
    }

    // Delete social account
    await db
      .delete(memberSocialAccounts)
      .where(eq(memberSocialAccounts.id, socialAccount.id));

    return c.json({
      success: true,
      message: `已取消連結 ${provider} 帳號`,
    });
  }
);

// -----------------------------------------------------------------------------
// GET /api/member/oauth/providers - Get available providers
// -----------------------------------------------------------------------------

app.get('/providers', async (c) => {
  const providers = [
    {
      provider: 'google',
      enabled: !!process.env.GOOGLE_CLIENT_ID,
      name: 'Google',
    },
    {
      provider: 'line',
      enabled: !!process.env.LINE_CHANNEL_ID,
      name: 'LINE',
    },
    {
      provider: 'apple',
      enabled: !!process.env.APPLE_CLIENT_ID,
      name: 'Apple',
    },
  ];

  return c.json({
    success: true,
    data: {
      providers: providers.filter(p => p.enabled),
    },
  });
});

export default app;
