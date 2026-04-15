-- Add damage assessment fields to clients table for Smart Estimates feature
alter table clients
add column if not exists damage_notes text,
add column if not exists inspection_findings text,
add column if not exists damage_severity text check (damage_severity in ('none','minor','moderate','severe','total_loss')) default null,
add column if not exists layers_of_shingles integer,
add column if not exists assessment_date date;
