-- Local development seed. NOT applied to production by `supabase db push`.
-- Put your own email here so the first sign-in lands you as an admin.
insert into private.admin_bootstrap (email)
values ('you@example.com')
on conflict (email) do nothing;
