-- Restore the canonical Ohio-county validator required by Finance correction.
-- Some live environments deployed the correction RPC without its historical dependency.
begin;

create or replace function public.is_ohio_county(p_county text) returns boolean
language sql immutable set search_path=pg_catalog,pg_temp as $$
 select btrim(coalesce(p_county,'')) = any(array['Adams','Allen','Ashland','Ashtabula','Athens','Auglaize','Belmont','Brown','Butler','Carroll','Champaign','Clark','Clermont','Clinton','Columbiana','Coshocton','Crawford','Cuyahoga','Darke','Defiance','Delaware','Erie','Fairfield','Fayette','Franklin','Fulton','Gallia','Geauga','Greene','Guernsey','Hamilton','Hancock','Hardin','Harrison','Henry','Highland','Hocking','Holmes','Huron','Jackson','Jefferson','Knox','Lake','Lawrence','Licking','Logan','Lorain','Lucas','Madison','Mahoning','Marion','Medina','Meigs','Mercer','Miami','Monroe','Montgomery','Morgan','Morrow','Muskingum','Noble','Ottawa','Paulding','Perry','Pickaway','Pike','Portage','Preble','Putnam','Richland','Ross','Sandusky','Scioto','Seneca','Shelby','Stark','Summit','Trumbull','Tuscarawas','Union','Van Wert','Vinton','Warren','Washington','Wayne','Williams','Wood','Wyandot']);
$$;

revoke all on function public.is_ohio_county(text) from public, anon, authenticated;
grant execute on function public.is_ohio_county(text) to service_role;
comment on function public.is_ohio_county(text) is
  'Canonical exact-name validator for all 88 Ohio counties; shared by Order tax metadata and Finance correction authorities.';

notify pgrst, 'reload schema';
commit;
