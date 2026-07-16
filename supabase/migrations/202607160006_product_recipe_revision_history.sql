-- Milestone 4B: persist the immutable prior-revision snapshots emitted by the recipe model.
-- Deploy manually after 202607160005_product_recipe_library.sql.
alter table public.product_recipes
  add column if not exists revision_history jsonb not null default '[]'::jsonb;

comment on column public.product_recipes.revision_history is
  'Immutable prior recipe revision snapshots retained when a new recipe revision is created.';
