-- Pharmacy module migration -- safe to run even though you've already
-- applied schema.sql once. Only touches inventory_items (adds a unique
-- constraint on name, if it's not already there) and seeds starter stock.
-- Does not affect prescriptions or any other table.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_items_name_key'
  ) then
    alter table inventory_items add constraint inventory_items_name_key unique (name);
  end if;
end $$;

insert into inventory_items (name, stock, max, reorder, mrp, schedule) values
  ('Paracetamol 500mg',       800, 1000, 150, 2.50,  null),
  ('Amoxicillin 500mg',       320, 500,  100, 6.00,  'H'),
  ('Azithromycin 500mg',      140, 300,  80,  18.00, 'H'),
  ('Ibuprofen 400mg',         600, 800,  120, 3.00,  null),
  ('Pantoprazole 40mg',       450, 600,  100, 5.50,  null),
  ('Metformin 500mg',         500, 700,  150, 2.00,  null),
  ('Amlodipine 5mg',          380, 500,  100, 3.50,  null),
  ('Atorvastatin 20mg',       310, 500,  100, 6.50,  null),
  ('Cefixime 200mg',          90,  300,  100, 22.00, 'H'),
  ('Ondansetron 4mg',         220, 400,  80,  4.00,  null),
  ('Insulin Glargine 100IU',  35,  100,  40,  450.00,'H'),
  ('Salbutamol Inhaler',      60,  150,  50,  180.00,null)
on conflict (name) do nothing;

-- If you haven't already run demo-open-access.sql (or ran it before this
-- migration), make sure prescriptions and inventory_items are covered --
-- re-run demo-open-access.sql to be safe, it's idempotent.
