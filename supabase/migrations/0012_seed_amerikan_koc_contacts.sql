-- Seed: Amerikan Hastanesi & Koç Üniversitesi Hastanesi directory entries
-- Sourced from collected business cards (2026-07-24). Idempotent: guarded by
-- name/email so re-running does not duplicate. Applied via service-role REST in
-- the same change; kept here as the canonical record per the hand-applied
-- migration convention.

-- Hospitals -----------------------------------------------------------------
insert into hospitals (name, city, contact, notes)
select 'Amerikan Hastanesi', 'İstanbul',
       E'Güzelbahçe Sokak No: 20, Şişli 34365 İstanbul\nT: 444 3 777\nF: 0212 311 21 90',
       'Vehbi Koç Vakfı — Amerikan Hastanesi'
where not exists (select 1 from hospitals where name = 'Amerikan Hastanesi');

insert into hospitals (name, city, contact, notes)
select 'Koç Üniversitesi Hastanesi', 'İstanbul',
       E'Davutpaşa Caddesi No: 4, Topkapı 34010 İstanbul\nT: 0 850 250 8 250\nF: 0212 311 34 10\nwww.kuh.ku.edu.tr',
       ''
where not exists (select 1 from hospitals where name = 'Koç Üniversitesi Hastanesi');

-- Doctors & coordinators ----------------------------------------------------
-- All medical staff live in `doctors`; nurses/coordinators use their title as
-- specialty. hospital_id resolved by hospital name.
insert into doctors (name, specialty, hospital_id, contact, notes)
select v.name, v.specialty, h.id, v.contact, v.notes
from (values
  ('Prof. Dr. Dursun Buğra',      'Genel Cerrahi Uzmanı',
     E'M: 0532 281 86 39\nT: 444 3 777 / 3761 - 3762\nF: 0212 311 21 90\ndursunb@amerikanhastanesi.org',
     'Amerikan Hastanesi', ''),
  ('Prof. Dr. Orhan Bilge',       'Genel Cerrahi Uzmanı',
     E'M: 0532 436 90 09\nT: 444 3 777 / 3761 - 3762\nF: 0212 311 21 90\norhanb@amerikanhastanesi.org',
     'Amerikan Hastanesi', ''),
  ('Prof. Dr. Nil Molinas Mandel','İç Hastalıkları Uzmanı',
     E'M: 0532 314 16 08\nT: 444 3 777 / 2530 - 2531\nF: 0212 311 21 90\nnilm@amerikanhastanesi.org',
     'Amerikan Hastanesi', ''),
  ('Özge Gonce',                  'Koordinatör Hemşire',
     E'M: 0549 823 52 89\nT: 444 3 777 / 8051\nF: 0212 311 21 90\nozgeg@amerikanhastanesi.org',
     'Amerikan Hastanesi', ''),
  ('Serpil Külte Bayram',         'Koordinatör Hemşire — Sindirim Sistemi Sağlığı',
     E'M: 0549 824 41 84\nT: 444 3 777 / 7881\nF: 0212 311 21 90\nserpilku@amerikanhastanesi.org',
     'Amerikan Hastanesi', ''),
  ('Habibe Ceren Toprak',         'Koordinatör Hemşire — Yetişkin Kemik İliği Transplantasyon',
     E'htoprak@kuh.ku.edu.tr\nwww.kuh.ku.edu.tr',
     'Koç Üniversitesi Hastanesi', '')
) as v(name, specialty, contact, hospital_name, notes)
left join hospitals h on h.name = v.hospital_name
where not exists (select 1 from doctors d where d.name = v.name);
