#!/bin/bash

# Get token
echo "Getting token..."
TOKEN=$(curl -s -X POST http://localhost:8055/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gym.com","password":"admin"}' \
  | grep -o '"access_token":"[^"]*"' \
  | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "Failed to get token"
  exit 1
fi

echo "Token obtained: ${TOKEN:0:20}..."

# Test quota status
echo -e "\n=== Testing /gym/quota/status ==="
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8055/gym/quota/status

# Test quota check
echo -e "\n\n=== Testing /gym/quota/check ==="
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resource":"members"}' \
  http://localhost:8055/gym/quota/check

echo -e "\n"
