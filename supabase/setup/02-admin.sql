-- Rode depois de criar seu usuário em Authentication > Users > Add user (ou Invite).
-- Torna esse usuário Admin NEST (vê e gerencia todos os tenants).
insert into public.platform_admins (user_id)
select id from auth.users where email = 'sheeephouse@gmail.com'
on conflict do nothing;

select u.email, pa.user_id is not null as admin
from auth.users u left join public.platform_admins pa on pa.user_id = u.id;
