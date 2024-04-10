create schema if not exists utility;

create or replace function utility.clone_from_template(template_id integer, iteration_idx integer)
returns integer
as $$
declare
  v_messaging_service_sid text;
  v_campaign campaign;
begin
  -- Check messaging service
  select coalesce(c.messaging_service_sid, ms.messaging_service_sid)
  into v_messaging_service_sid
  from all_campaign c
  left join messaging_service ms on ms.organization_id = c.organization_id
  where true
    and c.id = template_id
    and ms.active = true
  limit 1;

  -- Ensure messaging service
  if (v_messaging_service_sid) is null then
    raise exception 'No active messaging services found';
  end if;

  -- Copy campaign
  insert into campaign (
    organization_id,
    title,
    description,
    is_approved,
    is_started,
    is_archived,
    due_by,
    logo_image_url,
    intro_html,
    primary_color,
    texting_hours_start,
    texting_hours_end,
    timezone,
    creator_id,
    is_autoassign_enabled,
    limit_assignment_to_teams,
    replies_stale_after_minutes,
    external_system_id,
    messaging_service_sid
  )
  select
    organization_id,
    (case
      when is_template then replace(concat('COPY - ', title), '#', iteration_idx::text)
      else 'COPY - ' || title
    end) as title,
    description,
    false as is_approved,
    false as is_started,
    false as is_archived,
    due_by,
    logo_image_url,
    intro_html,
    primary_color,
    texting_hours_start,
    texting_hours_end,
    timezone,
    null as creator_id,
    false as is_autoassign_enabled,
    limit_assignment_to_teams,
    replies_stale_after_minutes,
    external_system_id,
    v_messaging_service_sid as messaging_service_sid
  from all_campaign
  where id = template_id
  returning *
  into v_campaign;

  -- Copy interactions

  -- Deferring constraints wasn't necessary when testing locally but I had nicely ordered interaction tuples so  ¯\_(ツ)_/¯
  -- set constraints "interaction_step_parent_interaction_id_foreign" deferred;

  with payloads as (
    select *, nextval('interaction_step_id_seq'::regclass) as new_id
    from interaction_step
    where true
      and is_deleted = false
      and campaign_id = template_id
  )
  insert into interaction_step (
    id,
    campaign_id,
    question,
    parent_interaction_id,
    answer_option,
    answer_actions,
    script_options
  )
  select
    payloads.new_id,
    v_campaign.id as campaign_id,
    payloads.question,
    parent_id_mapping.new_id as parent_interaction_id,
    payloads.answer_option,
    payloads.answer_actions,
    payloads.script_options
  from payloads
  left join payloads parent_id_mapping on payloads.parent_interaction_id = parent_id_mapping.id;

  -- Copy canned responses
  insert into canned_response (campaign_id, title, text, display_order)
  select
    v_campaign.id as campaign_id,
    title,
    text,
    display_order
  from canned_response
  where campaign_id = template_id;

  -- Copy teams
  insert into campaign_team (campaign_id, team_id)
  select
    v_campaign.id as campaign_id,
    team_id
  from campaign_team
  where campaign_id = template_id;

  -- Copy campaign groups
  insert into campaign_group_campaign (campaign_id, campaign_group_id)
  select
    v_campaign.id as campaign_id,
    campaign_group_id
  from campaign_group_campaign
  where campaign_id = template_id;

  -- Copy campaign variables
  insert into campaign_variable (campaign_id, display_order, name, value)
  select
    v_campaign.id as campaign_id,
    display_order,
    campaign_variable.name,
    (case
      when all_campaign.is_template then null
      else campaign_variable.value
    end)
  from campaign_variable
  join all_campaign on all_campaign.id = campaign_variable.campaign_id
  where true
    and campaign_id = template_id
    and deleted_at is null;

  return v_campaign.id;
end;
$$ language plpgsql volatile security invoker;

-- This can be used in combination with the import-contact-csv-from-url task for chunked inserts:

with new_campaigns as (
  select
    utility.clone_template(4, idx) as campaign_id,
    (idx - 1) * 100000 as offset,
    100000 as limit
  from generate_series(1, ceiling(250000/100000::decimal)) idx
)
select *
from new_campaigns
cross join lateral graphile_worker.add_job(
  'import-contact-csv-from-url',
  json_build_object(
    'campaignId',  new_campaigns.campaign_id,
    'offset': new_campaigns.offset,
    'limit': new_campaigns.limit,
    'initiateFilterLandlines', true,
    'signedDownloadUrl', 'https://s3.aws.amazon.com/my-secure-bucket/ak-export.csv',
    'columnMapping': json_build_object(
      'firstName', 'my_first_name_col_name',
      'lastName', 'my_last_name_col_name',
      'cell', 'my_cell_col_name',
      'externalId', 'my_external_id_col_name',
      'zip', 'my_zip_col_name'
    )
  ) as payload
) gw;
