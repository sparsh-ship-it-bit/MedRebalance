-- Seed the default medicine catalog for new MedRebalance projects.
INSERT INTO skus (id, name, category, unit_cost, cold_chain_required, default_daily_run_rate)
VALUES
  ('b2000000-0000-0000-0000-000000000001', 'Polyvalent Antivenom', 'Antivenom', 1850.00, true, 3),
  ('b2000000-0000-0000-0000-000000000002', 'IVIG (Intravenous Immunoglobulin)', 'Immunoglobulin', 12500.00, true, 2),
  ('b2000000-0000-0000-0000-000000000003', 'Albumin 20%', 'Plasma Protein', 3200.00, true, 4),
  ('b2000000-0000-0000-0000-000000000004', 'Remdesivir', 'Antiviral', 2800.00, true, 5),
  ('b2000000-0000-0000-0000-000000000005', 'Factor VIII', 'Clotting Factor', 9500.00, true, 2),
  ('b2000000-0000-0000-0000-000000000006', 'Heparin Sodium', 'Anticoagulant', 450.00, false, 8),
  ('b2000000-0000-0000-0000-000000000007', 'Insulin Glargine', 'Insulin', 850.00, true, 6),
  ('b2000000-0000-0000-0000-000000000008', 'Amoxicillin IV', 'Antibiotic', 120.00, false, 10),
  ('b2000000-0000-0000-0000-000000000009', 'Dopamine HCl', 'Vasopressor', 620.00, false, 4),
  ('b2000000-0000-0000-0000-000000000010', 'Midazolam', 'Sedative', 95.00, false, 7),
  ('b2000000-0000-0000-0000-000000000011', 'Oxytocin', 'Hormone', 180.00, true, 5),
  ('b2000000-0000-0000-0000-000000000012', 'Rabies Immunoglobulin', 'Immunoglobulin', 2100.00, true, 2),
  ('b2000000-0000-0000-0000-000000000013', 'Suxamethonium Chloride', 'Muscle Relaxant', 350.00, false, 4),
  ('b2000000-0000-0000-0000-000000000014', 'Packed Red Blood Cells', 'Blood Product', 1500.00, true, 3),
  ('b2000000-0000-0000-0000-000000000015', 'Furosemide', 'Diuretic', 75.00, false, 9)
ON CONFLICT (id) DO NOTHING;

-- Authenticated hospital users may add a new medicine to the shared catalog.
DROP POLICY IF EXISTS "auth_insert_skus" ON skus;
CREATE POLICY "auth_insert_skus" ON skus FOR INSERT
TO authenticated
WITH CHECK (true);
