# Mena BI

Business Intelligence platform for Mena Transport. Cloned structurally from
`mena-intelligence` — same shell, login, and permission system — starting with
an empty home page.

## Stack

- Next.js 16 (App Router) + React 19, Tailwind CSS 4, shadcn/radix
- next-auth 4 with Google OAuth, restricted to `@menatransport.co.th`
- MongoDB (`atms` db) — users in `bi_app_users`, groups in `bi_permission_groups`

## Auth flow

1. `/login` — Google sign-in (email must be `@menatransport.co.th`)
2. First sign-in upserts the user into `bi_app_users` with no groups
3. No groups → redirected to `/pending-access` until an admin assigns a group
4. Admins manage users/groups at `/admin/users` and `/admin/groups`

Permission keys: `bi` (general access), `admin`.

## Develop

```bash
npm install
npm run dev
```

Requires `.env` with `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `MONGO_URI`.
