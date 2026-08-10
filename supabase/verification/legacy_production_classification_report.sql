-- READ ONLY. Run before any operator-approved repair/classification.
select production_job_id,title,owner,created_at,production_status,quote_number,order_number,
 payload_quote_number,payload_order_number,payload_order_id,matching_quote_count,matching_order_count,
 candidate_order_id,candidate_order_number,candidate_source_quote_number,same_owner_result,
 modern_provenance_markers,classification,safe_repair_eligibility,exclusion_rejection_reason
from public.production_legacy_classification_report
order by classification,created_at,production_job_id;

select classification,count(*) affected_records
from public.production_legacy_classification_report
group by classification order by classification;

-- Explicit ambiguous list; these rows must remain untouched.
select * from public.production_legacy_classification_report where classification='AMBIGUOUS' order by created_at,production_job_id;
