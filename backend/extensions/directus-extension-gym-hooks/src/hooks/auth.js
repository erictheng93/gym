/**
 * Auth Hooks
 * 處理 SSO 登入和會員自動建立
 */

import { generateMemberCode } from './utils.js';

/**
 * 註冊認證鉤子
 */
export function registerAuthHooks({ action }, { services, database }, { emailService, emailServiceLoaded }) {
  const { ItemsService } = services;

  // 當透過 SSO 建立新 Directus 用戶時，自動建立會員記錄
  action('users.create', async ({ payload, key }, { schema }) => {
    if (!payload.provider || payload.provider === 'default') {
      return;
    }

    const memberRoleId = process.env.MEMBER_ROLE_ID || 'b1000000-0000-0000-0000-000000000001';

    if (payload.role !== memberRoleId) {
      // Status logged(`[GymHook] SSO user ${key} is not a member role, skipping auto-creation`);
      return;
    }

    try {
      const membersService = new ItemsService('members', {
        schema: schema,
        knex: database,
      });

      const socialAccountsService = new ItemsService('member_social_accounts', {
        schema: schema,
        knex: database,
      });

      let existingMember = null;
      if (payload.email) {
        const members = await membersService.readByQuery({
          filter: { email: { _eq: payload.email } },
          limit: 1,
        });
        existingMember = members[0] || null;
      }

      let memberId;

      if (existingMember) {
        memberId = existingMember.id;
        await membersService.updateOne(memberId, {
          user_id: key,
        });
        // Status logged(`[GymHook] Linked existing member ${memberId} to SSO user ${key} (${payload.provider})`);
      } else {
        const memberCode = await generateMemberCode(membersService);
        const fullName = `${payload.first_name || ''} ${payload.last_name || ''}`.trim() ||
                         payload.email?.split('@')[0] ||
                         '新會員';

        memberId = await membersService.createOne({
          user_id: key,
          member_code: memberCode,
          full_name: fullName,
          email: payload.email,
          phone: null,
          member_status: 'INACTIVE',
          join_date: new Date().toISOString().split('T')[0],
        });

        // Status logged(`[GymHook] Created new member ${memberId} (${memberCode}) for SSO user ${key} (${payload.provider})`);

        // 發送歡迎 Email
        if (emailServiceLoaded && emailService && emailService.isEmailEnabled() && payload.email) {
          try {
            const emailContent = emailService.buildWelcomeEmail({
              memberName: fullName,
              memberCode: memberCode,
              branchName: null,
            });

            await emailService.sendEmail({
              to: payload.email,
              subject: emailContent.subject,
              html: emailContent.html,
            });

            // Status logged(`[GymHook] Sent welcome email to ${payload.email}`);
          } catch (emailError) {
            // Error logged(`[GymHook] Failed to send welcome email:`, emailError.message);
          }
        }
      }

      // 建立社群帳號連結紀錄
      try {
        await socialAccountsService.createOne({
          member_id: memberId,
          provider: payload.provider,
          provider_user_id: payload.external_identifier || key,
          provider_email: payload.email,
          provider_name: `${payload.first_name || ''} ${payload.last_name || ''}`.trim(),
          is_primary: !existingMember,
          last_login_at: new Date().toISOString(),
        });
        // Status logged(`[GymHook] Created social account link: ${payload.provider} -> member ${memberId}`);
      } catch (socialError) {
        // Status logged('[GymHook] Could not create social account link:', socialError.message);
      }

    } catch (error) {
      // Error logged('[GymHook] Error auto-creating member from SSO:', error);
    }
  });

  // 當用戶透過 SSO 登入時，更新 last_login_at
  action('auth.login', async ({ payload, status, user, provider }, { schema }) => {
    if (!provider || provider === 'default' || status !== 'success') {
      return;
    }

    try {
      const socialAccountsService = new ItemsService('member_social_accounts', {
        schema: schema,
        knex: database,
      });

      const accounts = await socialAccountsService.readByQuery({
        filter: {
          _and: [
            { provider: { _eq: provider } },
            { provider_user_id: { _eq: user?.external_identifier || user?.id } },
            { status: { _eq: 'active' } },
          ],
        },
        limit: 1,
      });

      if (accounts.length > 0) {
        await socialAccountsService.updateOne(accounts[0].id, {
          last_login_at: new Date().toISOString(),
        });
        // Status logged(`[GymHook] Updated last_login_at for ${provider} account ${accounts[0].id}`);
      }
    } catch (error) {
      // Status logged('[GymHook] Could not update social login timestamp');
    }
  });
}

export default registerAuthHooks;
