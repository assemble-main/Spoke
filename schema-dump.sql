--
-- PostgreSQL database dump
--

-- Dumped from database version 14.4 (Ubuntu 14.4-1.pgdg18.04+1)
-- Dumped by pg_dump version 14.4 (Ubuntu 14.4-1.pgdg18.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO postgres;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: messaging_service_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.messaging_service_type AS ENUM (
    'twilio',
    'assemble-numbers'
);


ALTER TYPE public.messaging_service_type OWNER TO postgres;

--
-- Name: texter_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.texter_status AS ENUM (
    'do_not_approve',
    'approval_required',
    'auto_approve'
);


ALTER TYPE public.texter_status OWNER TO postgres;

--
-- Name: all_question_response_before_insert(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.all_question_response_before_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  update all_question_response
  set is_deleted = true, updated_at = now()
  where campaign_contact_id = NEW.campaign_contact_id
    and interaction_step_id = NEW.interaction_step_id
    and is_deleted = false;

  return NEW;
end;
$$;


ALTER FUNCTION public.all_question_response_before_insert() OWNER TO postgres;

--
-- Name: all_question_response_before_update(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.all_question_response_before_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  insert into all_question_response (campaign_contact_id, interaction_step_id, value, created_at, is_deleted)
  values (OLD.campaign_contact_id, OLD.interaction_step_id, OLD.value, OLD.created_at, true);

  return NEW;
end;
$$;


ALTER FUNCTION public.all_question_response_before_update() OWNER TO postgres;

--
-- Name: backfill_all_segment_info(bigint, bigint); Type: PROCEDURE; Schema: public; Owner: postgres
--

CREATE PROCEDURE public.backfill_all_segment_info(IN initial_min bigint, IN batch_size bigint)
    LANGUAGE plpgsql
    AS $$
    declare
      v_current_min_log_id bigint;
      v_max_log_id bigint;
      v_count_updated bigint;
    begin
      select max(id)
      from log
      into v_max_log_id;
      
      select initial_min into v_current_min_log_id;

      while v_current_min_log_id < v_max_log_id loop
        select backfill_segment_info(v_current_min_log_id, v_current_min_log_id + batch_size)
        into v_count_updated;
    
        raise notice 'Updated %s between %s and %s', 
          v_count_updated, v_current_min_log_id, v_current_min_log_id + batch_size;

        select v_current_min_log_id + batch_size
        into v_current_min_log_id;
      end loop;
    end;
    $$;


ALTER PROCEDURE public.backfill_all_segment_info(IN initial_min bigint, IN batch_size bigint) OWNER TO postgres;

--
-- Name: backfill_current_month_organization_message_usages(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.backfill_current_month_organization_message_usages() RETURNS void
    LANGUAGE sql
    AS $$
      insert into monthly_organization_message_usages (organization_id, month, sent_message_count)
      select 
        campaign.organization_id, 
        date_trunc('month', now()) as month,
        count(*) as sent_message_count
      from message
      join campaign_contact on campaign_contact.id = message.campaign_contact_id
      join campaign on campaign.id = campaign_contact.campaign_id
      where message.created_at >= date_trunc('month', now())
        and message.is_from_contact = false
      group by 1, 2
      on conflict (organization_id, month)
      do update
      set 
        sent_message_count = monthly_organization_message_usages.sent_message_count
    $$;


ALTER FUNCTION public.backfill_current_month_organization_message_usages() OWNER TO postgres;

--
-- Name: backfill_segment_info(bigint, bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.backfill_segment_info(min_log_id bigint, max_log_id bigint) RETURNS bigint
    LANGUAGE sql
    AS $$
      with info as (
        select body::json->>'messageId' as service_id,
          (body::json->'extra'->>'num_segments')::smallint as num_segments,
          (body::json->'extra'->>'num_media')::smallint as num_media
        from log
        where id >= min_log_id
          and id <= max_log_id
      ),
      update_result as (
        update message
        set num_segments = info.num_segments,
            num_media = info.num_media
        from info
        where info.service_id = message.service_id
        returning 1
      )
      select count(*)
      from update_result
    $$;


ALTER FUNCTION public.backfill_segment_info(min_log_id bigint, max_log_id bigint) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: all_campaign; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.all_campaign (
    id integer NOT NULL,
    organization_id integer NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    is_started boolean,
    due_by timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_archived boolean,
    use_dynamic_assignment boolean,
    logo_image_url text,
    intro_html text,
    primary_color text,
    texting_hours_start integer DEFAULT 9,
    texting_hours_end integer DEFAULT 21,
    timezone text DEFAULT 'America/New_York'::text,
    creator_id integer,
    is_autoassign_enabled boolean DEFAULT false NOT NULL,
    limit_assignment_to_teams boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    replies_stale_after_minutes integer,
    landlines_filtered boolean DEFAULT false,
    external_system_id uuid,
    is_approved boolean DEFAULT false NOT NULL,
    autosend_status text DEFAULT 'unstarted'::text,
    autosend_user_id integer,
    is_template boolean DEFAULT false NOT NULL,
    messaging_service_sid text,
    autosend_limit integer,
    CONSTRAINT campaign_autosend_status_check CHECK ((autosend_status = ANY (ARRAY['unstarted'::text, 'sending'::text, 'paused'::text, 'complete'::text])))
);


ALTER TABLE public.all_campaign OWNER TO postgres;

--
-- Name: campaigns_in_group(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.campaigns_in_group(group_id integer) RETURNS SETOF public.all_campaign
    LANGUAGE sql STABLE
    AS $$
        select *
        from all_campaign
        where exists (
          select 1
          from campaign_group_campaign
          join campaign_group on campaign_group.id = campaign_group_campaign.campaign_group_id
          where campaign_group_campaign.campaign_id = all_campaign.id
            and campaign_group.id = campaigns_in_group.group_id
        )
      $$;


ALTER FUNCTION public.campaigns_in_group(group_id integer) OWNER TO postgres;

--
-- Name: campaigns_in_group(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.campaigns_in_group(group_name text) RETURNS SETOF public.all_campaign
    LANGUAGE sql STABLE
    AS $$
        select *
        from all_campaign
        where exists (
          select 1
          from campaign_group_campaign
          join campaign_group on campaign_group.id = campaign_group_campaign.campaign_group_id
          where campaign_group_campaign.campaign_id = all_campaign.id
            and campaign_group.name = campaigns_in_group.group_name
        )
      $$;


ALTER FUNCTION public.campaigns_in_group(group_name text) OWNER TO postgres;

--
-- Name: cascade_archived_to_campaign_contacts(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.cascade_archived_to_campaign_contacts() RETURNS trigger
    LANGUAGE plpgsql STRICT
    SET search_path TO '$user', 'public'
    AS $$
        begin
          update campaign_contact
          set archived = NEW.is_archived
          where campaign_id = NEW.id;

          return NEW;
        end;
        $$;


ALTER FUNCTION public.cascade_archived_to_campaign_contacts() OWNER TO postgres;

--
-- Name: contact_is_textable_now(text, integer, integer, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.contact_is_textable_now(timezone text, start integer, stop integer, allow_null boolean) RETURNS boolean
    LANGUAGE sql
    AS $$
      select (timezone is null and allow_null)
        or (
          extract(hour from (CURRENT_TIMESTAMP at time zone timezone)) >= start
          and extract(hour from (CURRENT_TIMESTAMP at time zone timezone)) < stop
        )
    $$;


ALTER FUNCTION public.contact_is_textable_now(timezone text, start integer, stop integer, allow_null boolean) OWNER TO postgres;

--
-- Name: fetch_saved_list(integer, json, json, text, text, json); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fetch_saved_list(saved_list_id integer, row_merge json, column_config json, handler text, after text, context json) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    declare
      v_van_system_id uuid;
      v_username text;
      v_api_key_ref text;
    begin
      select system_id
      into v_van_system_id
      from external_list
      where external_list.external_id = fetch_saved_list.saved_list_id;

      select username
      into v_username
      from external_system
      where id = v_van_system_id;

      select get_api_key_ref_from_van_system_with_id(v_van_system_id)
      into v_api_key_ref;

      if v_api_key_ref is null then
      raise 'No API key configured for with id %', v_van_system_id;
      end if;

      perform graphile_worker.add_job(
        'van-fetch-saved-list',
        json_build_object(
          'username', v_username,
          'api_key', json_build_object('__secret', v_api_key_ref),
          'saved_list_id', fetch_saved_list.saved_list_id,
          'row_merge', fetch_saved_list.row_merge,
          'extract_phone_type', 'cell',
          'column_config', fetch_saved_list.column_config,
          'handler', fetch_saved_list.handler,
          '__after', fetch_saved_list.after,
          '__context', fetch_saved_list.context
        )
      );
    end;
    $$;


ALTER FUNCTION public.fetch_saved_list(saved_list_id integer, row_merge json, column_config json, handler text, after text, context json) OWNER TO postgres;

--
-- Name: get_api_key_ref_from_van_system_with_id(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_api_key_ref_from_van_system_with_id(van_system_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ select api_key_ref
    from external_system
    where id = get_api_key_ref_from_van_system_with_id.van_system_id
     $$;


ALTER FUNCTION public.get_api_key_ref_from_van_system_with_id(van_system_id uuid) OWNER TO postgres;

--
-- Name: messaging_service; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.messaging_service (
    messaging_service_sid text NOT NULL,
    organization_id integer,
    account_sid text DEFAULT ''::text NOT NULL,
    encrypted_auth_token text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    service_type public.messaging_service_type NOT NULL,
    name character varying(255) DEFAULT ''::character varying NOT NULL,
    active boolean DEFAULT true NOT NULL,
    is_default boolean,
    CONSTRAINT no_inactive_default CHECK ((active OR (is_default <> true)))
);


ALTER TABLE public.messaging_service OWNER TO postgres;

--
-- Name: get_messaging_service_for_campaign_contact_in_organization(integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_messaging_service_for_campaign_contact_in_organization(campaign_contact_id integer, organization_id integer) RETURNS public.messaging_service
    LANGUAGE sql STABLE STRICT
    AS $$
      select *
      from messaging_service
      where exists (
        select 1
        from messaging_service_stick
        where exists (
            select 1
            from campaign_contact
            where messaging_service_stick.cell = campaign_contact.cell
              and campaign_contact.id = get_messaging_service_for_campaign_contact_in_organization.campaign_contact_id
          )
          and organization_id = get_messaging_service_for_campaign_contact_in_organization.organization_id
          and messaging_service_stick.messaging_service_sid = messaging_service.messaging_service_sid
      )
    $$;


ALTER FUNCTION public.get_messaging_service_for_campaign_contact_in_organization(campaign_contact_id integer, organization_id integer) OWNER TO postgres;

--
-- Name: get_messaging_service_type(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_messaging_service_type(zip text) RETURNS public.messaging_service_type
    LANGUAGE plpgsql
    AS $$
    declare
      v_result messaging_service_type;
    begin
      select service_type
      from messaging_service
      limit 1 
      into v_result;

      return v_result;
    end;
    $$;


ALTER FUNCTION public.get_messaging_service_type(zip text) OWNER TO postgres;

--
-- Name: get_trollbot_matches(integer, interval); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_trollbot_matches(organization_id integer, troll_interval interval) RETURNS TABLE(message_id integer, trigger_token text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    begin
      return query
        with troll_tokens as (
          select token, mode, compiled_tsquery
          from troll_trigger
          where troll_trigger.organization_id = get_trollbot_matches.organization_id
        ),
        ts_queries as (
          select mode, to_tsquery('(' || array_to_string(array_agg(token), ') | (') || ')') as tsquery
          from troll_trigger
          where troll_trigger.organization_id = get_trollbot_matches.organization_id
          group by 1
        ),
        messages_to_consider as materialized (
          select message.id, text, is_from_contact, campaign_contact_id
          from message
          join campaign_contact
              on campaign_contact.id = message.campaign_contact_id
          join campaign
            on campaign.id = campaign_contact.campaign_id
          where true
            and campaign.organization_id = get_trollbot_matches.organization_id
            and message.created_at >= now() - get_trollbot_matches.troll_interval 
            and message.is_from_contact = false
            -- exclude initial messages
            and exists (
              select 1
              from message earlier_message 
              where earlier_message.campaign_contact_id = message.campaign_contact_id
                and earlier_message.created_at < message.created_at
            )
        ),
        bad_messages as (
          select distinct on (m.id) m.id, mode, text, is_from_contact
          from messages_to_consider m
          join ts_queries on to_tsvector(regconfig_mode(mode), m.text) @@ ts_queries.tsquery
          order by m.id, mode
        ),
        messages_with_match as (
          select bad_messages.id, bad_messages.text, token
          from bad_messages
          join troll_tokens on to_tsvector(regconfig_mode(troll_tokens.mode), bad_messages.text) @@ troll_tokens.compiled_tsquery
          where troll_tokens.mode = bad_messages.mode
        )
        select id, token::text as trigger_token
        from messages_with_match;
    end;
    $$;


ALTER FUNCTION public.get_trollbot_matches(organization_id integer, troll_interval interval) OWNER TO postgres;

--
-- Name: insert_saved_lists(json, json, json); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.insert_saved_lists(payload json, result json, context json) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    begin
      update public.external_system
      set synced_at = now()
      where id = (payload->>'van_system_id')::uuid;

      insert into external_list (external_id, name, description, list_count, door_count, system_id)
      select
        (j->>'saved_list_id')::integer,
        j->>'name',
        j->>'description',
        (j->>'list_count')::integer,
        (j->>'door_count')::integer,
        (j->>'van_system_id')::uuid
      from json_array_elements(result) as j
      on conflict (system_id, external_id)
      do update set
        name = excluded.name,
        description = excluded.description,
        list_count = excluded.list_count,
        door_count = excluded.door_count;
    end;
    $$;


ALTER FUNCTION public.insert_saved_lists(payload json, result json, context json) OWNER TO postgres;

--
-- Name: insert_van_activist_codes(json, json, json); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.insert_van_activist_codes(payload json, result json, context json) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    begin
      with activist_code_insert_results as (
        insert into external_activist_code
          (system_id, external_id, type, name, medium_name, short_name, description, script_question, status)
        select
          (j->>'van_system_id')::uuid,
          (j->>'activist_code_id')::integer,
          j->>'type',
          j->>'name',
          j->>'medium_name',
          j->>'short_name',
          j->>'description',
          j->>'script_question',
          (j->>'status')
        from json_array_elements(result) as j
        on conflict (system_id, external_id)
        do update set
          type = EXCLUDED.type,
          name = EXCLUDED.name,
          medium_name = EXCLUDED.medium_name,
          short_name = EXCLUDED.short_name,
          description = EXCLUDED.description,
          script_question = EXCLUDED.script_question,
          status = EXCLUDED.status
        returning id, system_id
      )
      -- Delete archived activist codes
      delete from external_activist_code
      where
        system_id = (select system_id from activist_code_insert_results limit 1)
        and id not in (select id from activist_code_insert_results)
      ;
    end;
    $$;


ALTER FUNCTION public.insert_van_activist_codes(payload json, result json, context json) OWNER TO postgres;

--
-- Name: insert_van_contact_batch_to_campaign_contact(json); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.insert_van_contact_batch_to_campaign_contact(record_list json) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
      insert into campaign_contact (campaign_id, external_id, first_name, last_name, zip, custom_fields, cell)
      select
        (r ->> 'campaign_id')::integer,
        r ->> 'external_id',
        r ->> 'first_name',
        r ->> 'last_name',
        r ->> 'zip',
        r ->> 'custom_fields',
        r ->> 'cell'
      from json_array_elements(record_list) as r
      where r ->> 'first_name' is not null
        and r ->> 'last_name' is not null
        and r ->> 'cell' is not null
        and not exists (
          select 1
          from opt_out
          where opt_out.cell = r->>'cell'
            and opt_out.organization_id = ( select organization_id from campaign where id = (r ->> 'campaign_id')::integer )
        )
      on conflict (campaign_id, cell) do nothing
    $$;


ALTER FUNCTION public.insert_van_contact_batch_to_campaign_contact(record_list json) OWNER TO postgres;

--
-- Name: insert_van_result_codes(json, json, json); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.insert_van_result_codes(payload json, result json, context json) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    begin
      with result_code_insert_results as (
        insert into external_result_code
          (system_id, external_id, name, medium_name, short_name)
        select
          (j->>'van_system_id')::uuid,
          (j->>'result_code_id')::integer,
          j->>'name',
          j->>'medium_name',
          j->>'short_name'
        from json_array_elements(result) as j
        on conflict (system_id, external_id)
        do update set
          name = EXCLUDED.name,
          medium_name = EXCLUDED.medium_name,
          short_name = EXCLUDED.short_name
        returning id, system_id
      )
      -- Delete archived result codes
      delete from external_result_code
      where
        system_id = (select system_id from result_code_insert_results limit 1)
        and id not in (select id from result_code_insert_results)
      ;
    end;
    $$;


ALTER FUNCTION public.insert_van_result_codes(payload json, result json, context json) OWNER TO postgres;

--
-- Name: insert_van_survey_questions(json, json, json); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.insert_van_survey_questions(payload json, result json, context json) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    begin
      -- Upsert survey questions, storing the mapping from VAN's ID -> local ID
      with survey_question_mapping as (
        insert into external_survey_question
          (system_id, external_id, type, cycle, name, medium_name, short_name, script_question, status)
        select
          (j->>'van_system_id')::uuid,
          (j->>'survey_question_id')::integer,
          j->>'type',
          (j->>'cycle')::integer,
          j->>'name',
          j->>'medium_name',
          j->>'short_name',
          j->>'script_question',
          (j->>'status')
        from json_array_elements(result) as j
        on conflict (system_id, external_id) 
        do update set
          type = EXCLUDED.type,
          cycle = EXCLUDED.cycle,
          name = EXCLUDED.name,
          medium_name = EXCLUDED.medium_name,
          short_name = EXCLUDED.short_name,
          script_question = EXCLUDED.script_question,
          status = EXCLUDED.status
        returning id, external_id, system_id
      ),

      -- Delete archived survey questions
      flush_survey_questions as (
        delete from external_survey_question
        where
          system_id = (select system_id from survey_question_mapping limit 1)
          and id not in (select id from survey_question_mapping)
      ),

      -- Upsert response options
      response_option_insert_results as (
        insert into external_survey_question_response_option
          (external_survey_question_id, external_id, name, medium_name, short_name)
        select
          survey_question_mapping.id,
          (j->>'survey_question_response_option_id')::integer as external_id,
          j->>'name',
          j->>'medium_name',
          j->>'short_name'
        from (
          select
            (inner_json->>'van_system_id')::uuid as system_id,
            (inner_json->>'survey_question_id')::integer as survey_question_id,
            json_array_elements(inner_json->'responses') as j
          from json_array_elements(result) as inner_json
        ) survey_questions
        join survey_question_mapping
          on survey_question_mapping.external_id = survey_questions.survey_question_id
        on conflict (external_survey_question_id, external_id)
        do update set
          name = EXCLUDED.name,
          medium_name = EXCLUDED.medium_name,
          short_name = EXCLUDED.short_name
        returning id
      )

      -- Delete archived response options
      delete from external_survey_question_response_option
      where
        external_survey_question_id in (select id from survey_question_mapping)
        and id not in (select id from response_option_insert_results)
      ;
    end;
    $$;


ALTER FUNCTION public.insert_van_survey_questions(payload json, result json, context json) OWNER TO postgres;

--
-- Name: mark_loading_job_done(json, json, json); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.mark_loading_job_done(payload json, result json, context json) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    declare
      v_contact_count integer;
    begin
      select count(*)
      from campaign_contact
      where campaign_id = (context->>'campaign_id')::integer
      into v_contact_count;

      update public.job_request
      set
        status = 100,
        result_message = 'Number of contacts loaded from external system: ' || v_contact_count::text
      where id = (context->>'job_request_id')::integer;
    end;
    $$;


ALTER FUNCTION public.mark_loading_job_done(payload json, result json, context json) OWNER TO postgres;

--
-- Name: question_response_instead_of_delete(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.question_response_instead_of_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  update all_question_response
  set is_deleted = true, updated_at = now()
  where id = OLD.id;

  return OLD;
end;
$$;


ALTER FUNCTION public.question_response_instead_of_delete() OWNER TO postgres;

--
-- Name: queue_load_list_into_campaign(integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.queue_load_list_into_campaign(campaign_id integer, list_external_id integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    declare
      v_job_request_id integer;
    begin
      insert into public.job_request (campaign_id, payload, queue_name, job_type, status)
      values (campaign_id, '', campaign_id::text || ':edit_campaign', 'load_external_list', 0)
      returning id
      into v_job_request_id;

      perform fetch_saved_list(
        list_external_id,
        json_build_object('campaign_id', campaign_id),
        json_build_object(
          'external_id', 'VanID',
          'first_name', 'FirstName',
          'last_name', 'LastName',
          'zip', 'ZipOrPostal',
          'custom_fields', json_build_array(
            'Address',
            'StreetAddress',
            'City',
            'State',
            'County',
            'Employer',
            'Occupation',
            'Email',
            'HomePhone',
            'HomePhoneDialingPrefix',
            'HomePhoneCountryCode',
            'HomePhoneID',
            'IsHomePhoneACellExchange',
            'CellPhone',
            'CellPhoneDialingPrefix',
            'CellPhoneCountryCode',
            'CellPhoneID',
            'WorkPhone',
            'WorkPhoneDialingPrefix',
            'WorkPhoneCountryCode',
            'WorkPhoneID',
            'IsWorkPhoneACellExchange',
            'Phone',
            'PhoneDialingPrefix',
            'PhoneCountryCode',
            'PhoneID',
            'OptInPhone',
            'OptInPhoneDialingPrefix',
            'OptInPhoneCountryCode',
            'OptInStatus',
            'OptInPhoneID',
            'OptInPhoneType',
            'CongressionalDistrict',
            'StateHouse',
            'StateSenate',
            'Party',
            'PollingLocation',
            'PollingAddress',
            'PollingCity',
            'phone_id'
          ),
          'cell', 'cell'
        ),
        'insert_van_contact_batch_to_campaign_contact',
        'mark_loading_job_done',
        ('{"job_request_id": "' || v_job_request_id || '", "campaign_id": "' || campaign_id || '"}')::json
      );
    end;
    $$;


ALTER FUNCTION public.queue_load_list_into_campaign(campaign_id integer, list_external_id integer) OWNER TO postgres;

--
-- Name: queue_refresh_saved_lists(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.queue_refresh_saved_lists(van_system_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    declare
      v_username text;
      v_api_key_ref text;
      v_secret graphile_secrets.secrets;
    begin
      select username, api_key_ref
      into v_username, v_api_key_ref
      from external_system
      where id = queue_refresh_saved_lists.van_system_id;

      if v_api_key_ref is null then
        raise 'No API key configured for with id %', queue_refresh_saved_lists.van_system_id;
      end if;

      delete from external_list
      where system_id = queue_refresh_saved_lists.van_system_id;

      perform graphile_worker.add_job(
        'van-get-saved-lists',
        json_build_object(
          'username', v_username,
          'api_key', json_build_object('__secret', v_api_key_ref),
          'van_system_id', queue_refresh_saved_lists.van_system_id,
          '__after', 'insert_saved_lists'
        )
      );
    end;
    $$;


ALTER FUNCTION public.queue_refresh_saved_lists(van_system_id uuid) OWNER TO postgres;

--
-- Name: queue_refresh_van_activist_codes(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.queue_refresh_van_activist_codes(van_system_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    declare
      v_api_key_ref text;
      v_secret graphile_secrets.secrets;
    begin
      select api_key_ref
      from external_system
      where id = queue_refresh_van_activist_codes.van_system_id
      into v_api_key_ref;

      if v_api_key_ref is null then
        raise 'No API key configured for with id %', queue_refresh_van_activist_codes.van_system_id;
      end if;

      perform graphile_worker.add_job(
        'van-get-activist-codes',
        json_build_object(
          'api_key', json_build_object('__secret', v_api_key_ref),
          'van_system_id', queue_refresh_van_activist_codes.van_system_id,
          '__after', 'insert_van_activist_codes'
        ),
        'van-api',
        priority => 0
      );
    end;
    $$;


ALTER FUNCTION public.queue_refresh_van_activist_codes(van_system_id uuid) OWNER TO postgres;

--
-- Name: queue_refresh_van_result_codes(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.queue_refresh_van_result_codes(van_system_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    declare
      v_api_key_ref text;
      v_secret graphile_secrets.secrets;
    begin
      select api_key_ref
      from external_system
      where id = queue_refresh_van_result_codes.van_system_id
      into v_api_key_ref;

      if v_api_key_ref is null then
        raise 'No API key configured for with id %', queue_refresh_van_result_codes.van_system_id;
      end if;

      perform graphile_worker.add_job(
        'van-get-result-codes',
        json_build_object(
          'api_key', json_build_object('__secret', v_api_key_ref),
          'van_system_id', queue_refresh_van_result_codes.van_system_id,
          '__after', 'insert_van_result_codes'
        ),
        'van-api',
        priority => 0
      );
    end;
    $$;


ALTER FUNCTION public.queue_refresh_van_result_codes(van_system_id uuid) OWNER TO postgres;

--
-- Name: queue_refresh_van_survey_questions(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.queue_refresh_van_survey_questions(van_system_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    declare
      v_api_key_ref text;
      v_secret graphile_secrets.secrets;
    begin
      select api_key_ref
      from external_system
      where id = queue_refresh_van_survey_questions.van_system_id
      into v_api_key_ref;
  
      if v_api_key_ref is null then
        raise 'No API key configured for with id %', queue_refresh_van_survey_questions.van_system_id;
      end if;
  
      perform graphile_worker.add_job(
        'van-get-survey-questions',
        json_build_object(
          'api_key', json_build_object('__secret', v_api_key_ref),
          'van_system_id', queue_refresh_van_survey_questions.van_system_id,
          '__after', 'insert_van_survey_questions'
        ),
        'van-api',
        priority => 0
      );
    end;
    $$;


ALTER FUNCTION public.queue_refresh_van_survey_questions(van_system_id uuid) OWNER TO postgres;

--
-- Name: queue_sync_campaign_to_van(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.queue_sync_campaign_to_van(campaign_id integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    declare
      v_system_id uuid;
      v_username text;
      v_api_key_ref text;
      v_missing_configs integer;
      v_job_request_id integer;
      v_contact_count integer;
    begin
      select external_system_id
      from campaign where id = queue_sync_campaign_to_van.campaign_id
      into v_system_id;

      if v_system_id is null then
        raise 'No external system configured for campaign with id %', queue_sync_campaign_to_van.campaign_id;
      end if;

      select username, api_key_ref
      from external_system
      where id = v_system_id
      into v_username, v_api_key_ref;

      if v_api_key_ref is null then
        raise 'No API key configured for with id %', v_system_id;
      end if;

      select count(*)
      from external_sync_question_response_configuration qrc
      where
        qrc.campaign_id = queue_sync_campaign_to_van.campaign_id
        and qrc.system_id = v_system_id
        and is_missing = true
        and is_required = true
      into v_missing_configs;

      if v_missing_configs > 0 then
        raise 'Campaign % is missing % required configs', queue_sync_campaign_to_van.campaign_id, v_missing_configs;
      end if;

      select count(*)
      from campaign_contact
      where campaign_contact.campaign_id = queue_sync_campaign_to_van.campaign_id
      into v_contact_count;

      insert into public.job_request (campaign_id, payload, result_message, queue_name, job_type, status)
      values (
        campaign_id,
        json_build_object('contact_count', v_contact_count)::text,
        json_build_object('message', 'Synced 0 of ' || v_contact_count || ' contacts to VAN')::text,
        campaign_id::text || ':sync_campaign',
        'sync_van_campaign',
        0
      )
      returning id
      into v_job_request_id;

      perform
        graphile_worker.add_job(
          'van-sync-campaign-contact',
          payload,
          -- VAN API docs suggest 60 req/s for post canvass results; we'll use 30 req/s to be safe
          -- Ref: https://docs.ngpvan.com/docs/throttling-guidelines#suggested-throttling
          run_at => now() + (interval '1 second' / 30) * n,
          priority => 10
        )
      from (
        select 
          json_build_object(
            'username', v_username,
            'api_key', json_build_object('__secret', v_api_key_ref),
            'system_id', v_system_id,
            'cc_created_at', cc.created_at,
            'campaign_id', cc.campaign_id,
            'contact_id', cc.id,
            'external_id', cc.external_id,
            'phone_id', ((cc.custom_fields)::json->>'phone_id')::integer,
            'phone_number', cc.cell,
            '__context', json_build_object(
              'job_request_id', v_job_request_id,
              'contact_count', v_contact_count
            )
          ) as payload,
          row_number() over (partition by 1) as n
        from public.campaign_contact cc
        where
          cc.campaign_id = queue_sync_campaign_to_van.campaign_id
      ) payloads;
    end;
    $$;


ALTER FUNCTION public.queue_sync_campaign_to_van(campaign_id integer) OWNER TO postgres;

--
-- Name: troll_alarm; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.troll_alarm (
    message_id integer NOT NULL,
    trigger_token character varying(255) NOT NULL,
    dismissed boolean DEFAULT false,
    organization_id integer NOT NULL
);


ALTER TABLE public.troll_alarm OWNER TO postgres;

--
-- Name: raise_trollbot_alarms(integer, interval); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.raise_trollbot_alarms(organization_id integer, troll_interval interval) RETURNS SETOF public.troll_alarm
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    declare
      v_result bigint;
    begin
      return query
      with insert_results as (
        insert into troll_alarm (organization_id, message_id, trigger_token)
        select
          raise_trollbot_alarms.organization_id,
          message_id,
          trigger_token
        from ( select * from public.get_trollbot_matches (organization_id, troll_interval) ) alarms
        on conflict (message_id) do nothing
        returning *
      )
      select *
      from insert_results;
    end;
    $$;


ALTER FUNCTION public.raise_trollbot_alarms(organization_id integer, troll_interval interval) OWNER TO postgres;

--
-- Name: regconfig_mode(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.regconfig_mode(mode text) RETURNS regconfig
    LANGUAGE plpgsql IMMUTABLE
    AS $$
    begin
      return cast(mode as regconfig);
    end
    $$;


ALTER FUNCTION public.regconfig_mode(mode text) OWNER TO postgres;

--
-- Name: soft_delete_tag(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.soft_delete_tag() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    begin
      update all_tag
      set deleted_at = now()
      where all_tag.id = OLD.id;

      return OLD;
    end; $$;


ALTER FUNCTION public.soft_delete_tag() OWNER TO postgres;

--
-- Name: spoke_tz_to_iso_tz(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.spoke_tz_to_iso_tz(spoke_tz text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
      select case
        when spoke_tz = '-10_1' then 'Pacific/Honolulu'
        when spoke_tz = '-9_1' then 'America/Anchorage'
        when spoke_tz = '-8_1' then 'America/Los_Angeles'
        when spoke_tz = '-7_1' then 'America/Denver'
        when spoke_tz = '-6_0' then 'America/Chicago'
        when spoke_tz = '-5_1' then 'America/New_York'
        when spoke_tz = '-5_0' then 'America/New_York'
        else null
      end;
    $$;


ALTER FUNCTION public.spoke_tz_to_iso_tz(spoke_tz text) OWNER TO postgres;

--
-- Name: tg__log__handle_delivery_report(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.tg__log__handle_delivery_report() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    begin
      perform graphile_worker.add_job(
        'handle-delivery-report',
        row_to_json(NEW),
        priority := 5
      );

      return NEW;
    end;
    $$;


ALTER FUNCTION public.tg__log__handle_delivery_report() OWNER TO postgres;

--
-- Name: tg__user__backfill_superadmin_membership(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.tg__user__backfill_superadmin_membership() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    begin
      insert into user_organization (user_id, organization_id, role)
      select
        NEW.id as user_id,
        organization.id as organization_id,
        'OWNER' as role
      from organization
      on conflict (user_id, organization_id)
        do update set role = EXCLUDED.role;

      return NEW;
    end;
    $$;


ALTER FUNCTION public.tg__user__backfill_superadmin_membership() OWNER TO postgres;

--
-- Name: tg_campaign_check_exteral_system_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.tg_campaign_check_exteral_system_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    declare
      v_system_organization_id integer;
    begin
      select organization_id
      from public.external_system
      where id = NEW.external_system_id
      into v_system_organization_id;

      if NEW.organization_id <> v_system_organization_id
      then
        raise exception 'External system referenced by [external_system_id:%] must belong to the same organization!',
          NEW.external_system_id;
      end if;

      return NEW;
    end;
    $$;


ALTER FUNCTION public.tg_campaign_check_exteral_system_id() OWNER TO postgres;

--
-- Name: troll_patrol(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.troll_patrol() RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    declare
      v_result bigint;
    begin
      with job_results as (
        select graphile_worker.add_job(
          'troll-patrol-for-org',
          json_build_object('organization_id', organization.id)
        )
        from organization
      )
      select count(*)
      from job_results
      into v_result;

      return v_result;
    end;
    $$;


ALTER FUNCTION public.troll_patrol() OWNER TO postgres;

--
-- Name: universal_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.universal_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    begin
      NEW.updated_at = CURRENT_TIMESTAMP;
      return NEW;
    end; $$;


ALTER FUNCTION public.universal_updated_at() OWNER TO postgres;

--
-- Name: update_van_sync_job_request_status(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_van_sync_job_request_status() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    declare
      v_job_request_id integer;
      v_contact_count integer;
      v_remaining_syncs integer;
      v_result_message text;
    begin
      with pending_sync_jobs as (
        select
          id,
          ((payload::json)->>'contact_count')::integer as contact_count
        from job_request
        where
          created_at > now() - '12 hour'::interval
          and job_type = 'sync_van_campaign'
          and status <> 100
        order by campaign_id, updated_at desc
      ),
      payloads as (
        select
          id,
          contact_count,
          sum(jobs_remaining) as jobs_remaining,
          jsonb_object_agg(last_error, error_count) filter (where last_error is not null) as errors
        from (
          select
            pending_sync_jobs.id,
            pending_sync_jobs.contact_count,
            count(jobs.id) as jobs_remaining,
            count(jobs.last_error) as error_count,
            jobs.last_error
          from pending_sync_jobs
          left join graphile_worker.jobs jobs
            on (jobs.payload->'__context'->>'job_request_id')::integer = pending_sync_jobs.id
          group by 1, 2, 5
        ) inner_grouping
        group by 1, 2
      )
      update job_request
      set
        status = (contact_count - jobs_remaining) / (contact_count) * 100,
        result_message = (
          json_build_object('message', 'Synced ' || (contact_count - jobs_remaining) || ' of ' || contact_count || ' contacts to VAN')::jsonb
          || (
            case
              when errors is not null then json_build_object('error_counts', errors)::jsonb
              else '{}'::jsonb
            end
          )
        )::text
      from payloads
      where job_request.id = payloads.id;
    end;
    $$;


ALTER FUNCTION public.update_van_sync_job_request_status() OWNER TO postgres;

--
-- Name: action_external_system_sync; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.action_external_system_sync (
    id integer NOT NULL,
    action_id integer NOT NULL,
    action_type text NOT NULL,
    sync_status text DEFAULT 'CREATED'::text NOT NULL,
    synced_at timestamp with time zone,
    sync_error text,
    extra_data json,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT action_external_system_sync_action_type_check CHECK ((action_type = ANY (ARRAY['question_response'::text, 'opt_out'::text]))),
    CONSTRAINT action_external_system_sync_sync_status_check CHECK ((sync_status = ANY (ARRAY['CREATED'::text, 'SYNC_QUEUED'::text, 'SYNCED'::text, 'SYNC_FAILED'::text, 'SKIPPED'::text])))
);


ALTER TABLE public.action_external_system_sync OWNER TO postgres;

--
-- Name: action_external_system_sync_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.action_external_system_sync_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.action_external_system_sync_id_seq OWNER TO postgres;

--
-- Name: action_external_system_sync_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.action_external_system_sync_id_seq OWNED BY public.action_external_system_sync.id;


--
-- Name: all_external_sync_question_response_configuration; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.all_external_sync_question_response_configuration (
    id uuid DEFAULT public.uuid_generate_v1mc() NOT NULL,
    system_id uuid NOT NULL,
    campaign_id integer NOT NULL,
    interaction_step_id integer NOT NULL,
    question_response_value text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.all_external_sync_question_response_configuration OWNER TO postgres;

--
-- Name: all_question_response; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.all_question_response (
    id integer NOT NULL,
    campaign_contact_id integer NOT NULL,
    interaction_step_id integer NOT NULL,
    value text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_deleted boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
)
WITH (autovacuum_vacuum_scale_factor='0', autovacuum_vacuum_threshold='2000');


ALTER TABLE public.all_question_response OWNER TO postgres;

--
-- Name: all_tag; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.all_tag (
    id integer NOT NULL,
    organization_id integer NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    text_color text DEFAULT '#000000'::text NOT NULL,
    background_color text DEFAULT '#DDEEEE'::text NOT NULL,
    author_id integer,
    confirmation_steps text[] DEFAULT '{}'::text[] NOT NULL,
    on_apply_script text DEFAULT ''::text NOT NULL,
    webhook_url text DEFAULT ''::text NOT NULL,
    is_assignable boolean DEFAULT true NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp without time zone
);


ALTER TABLE public.all_tag OWNER TO postgres;

--
-- Name: campaign; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.campaign AS
 SELECT all_campaign.id,
    all_campaign.organization_id,
    all_campaign.title,
    all_campaign.description,
    all_campaign.is_started,
    all_campaign.due_by,
    all_campaign.created_at,
    all_campaign.is_archived,
    all_campaign.use_dynamic_assignment,
    all_campaign.logo_image_url,
    all_campaign.intro_html,
    all_campaign.primary_color,
    all_campaign.texting_hours_start,
    all_campaign.texting_hours_end,
    all_campaign.timezone,
    all_campaign.creator_id,
    all_campaign.is_autoassign_enabled,
    all_campaign.limit_assignment_to_teams,
    all_campaign.updated_at,
    all_campaign.replies_stale_after_minutes,
    all_campaign.landlines_filtered,
    all_campaign.external_system_id,
    all_campaign.is_approved,
    all_campaign.autosend_status,
    all_campaign.autosend_user_id,
    all_campaign.messaging_service_sid,
    all_campaign.autosend_limit
   FROM public.all_campaign
  WHERE (all_campaign.is_template = false);


ALTER TABLE public.campaign OWNER TO postgres;

--
-- Name: campaign_contact; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.campaign_contact (
    id integer NOT NULL,
    campaign_id integer NOT NULL,
    assignment_id integer,
    external_id text DEFAULT ''::text NOT NULL,
    first_name text DEFAULT ''::text NOT NULL,
    last_name text DEFAULT ''::text NOT NULL,
    cell text NOT NULL,
    zip text DEFAULT ''::text NOT NULL,
    custom_fields text DEFAULT '{}'::text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    message_status text DEFAULT 'needsMessage'::text NOT NULL,
    is_opted_out boolean DEFAULT false,
    timezone character varying(255),
    archived boolean DEFAULT false,
    CONSTRAINT campaign_contact_message_status_check CHECK ((message_status = ANY (ARRAY['needsMessage'::text, 'needsResponse'::text, 'convo'::text, 'messaged'::text, 'closed'::text, 'UPDATING'::text])))
)
WITH (autovacuum_vacuum_scale_factor='0', autovacuum_vacuum_threshold='20000', fillfactor='85');


ALTER TABLE public.campaign_contact OWNER TO postgres;

--
-- Name: campaign_contact_tag; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.campaign_contact_tag (
    campaign_contact_id integer NOT NULL,
    tag_id integer NOT NULL,
    tagger_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.campaign_contact_tag OWNER TO postgres;

--
-- Name: tag; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.tag AS
 SELECT all_tag.id,
    all_tag.organization_id,
    all_tag.title,
    all_tag.description,
    all_tag.text_color,
    all_tag.background_color,
    all_tag.author_id,
    all_tag.confirmation_steps,
    all_tag.on_apply_script,
    all_tag.webhook_url,
    all_tag.is_assignable,
    all_tag.is_system,
    all_tag.created_at,
    all_tag.updated_at,
    all_tag.deleted_at
   FROM public.all_tag
  WHERE (all_tag.deleted_at IS NULL);


ALTER TABLE public.tag OWNER TO postgres;

--
-- Name: assignable_campaign_contacts; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.assignable_campaign_contacts AS
 SELECT campaign_contact.id,
    campaign_contact.campaign_id,
    campaign_contact.message_status,
    campaign.texting_hours_end,
    (campaign_contact.timezone)::text AS contact_timezone
   FROM (public.campaign_contact
     JOIN public.campaign ON ((campaign_contact.campaign_id = campaign.id)))
  WHERE ((campaign_contact.assignment_id IS NULL) AND (campaign_contact.is_opted_out = false) AND (campaign_contact.archived = false) AND (NOT (EXISTS ( SELECT 1
           FROM (public.campaign_contact_tag
             JOIN public.tag ON ((campaign_contact_tag.tag_id = tag.id)))
          WHERE ((tag.is_assignable = false) AND (campaign_contact_tag.campaign_contact_id = campaign_contact.id))))));


ALTER TABLE public.assignable_campaign_contacts OWNER TO postgres;

--
-- Name: assignable_campaign_contacts_with_escalation_tags; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.assignable_campaign_contacts_with_escalation_tags AS
 SELECT campaign_contact.id,
    campaign_contact.campaign_id,
    campaign_contact.message_status,
    (campaign_contact.timezone)::text AS contact_timezone,
    ( SELECT array_agg(all_tag.id) AS array_agg
           FROM (public.campaign_contact_tag
             JOIN public.all_tag ON ((campaign_contact_tag.tag_id = all_tag.id)))
          WHERE ((campaign_contact_tag.campaign_contact_id = campaign_contact.id) AND (all_tag.is_assignable = false))) AS applied_escalation_tags
   FROM public.campaign_contact
  WHERE ((campaign_contact.assignment_id IS NULL) AND (campaign_contact.is_opted_out = false) AND (campaign_contact.archived = false) AND (EXISTS ( SELECT 1
           FROM (public.campaign_contact_tag
             JOIN public.all_tag ON ((campaign_contact_tag.tag_id = all_tag.id)))
          WHERE ((all_tag.is_assignable = false) AND (campaign_contact_tag.campaign_contact_id = campaign_contact.id)))));


ALTER TABLE public.assignable_campaign_contacts_with_escalation_tags OWNER TO postgres;

--
-- Name: sendable_campaigns; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.sendable_campaigns AS
 SELECT campaign.id,
    campaign.title,
    campaign.organization_id,
    campaign.limit_assignment_to_teams,
    campaign.autosend_status,
    campaign.is_autoassign_enabled
   FROM public.campaign
  WHERE (campaign.is_started AND (NOT campaign.is_archived));


ALTER TABLE public.sendable_campaigns OWNER TO postgres;

--
-- Name: assignable_campaigns; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.assignable_campaigns AS
 SELECT sendable_campaigns.id,
    sendable_campaigns.title,
    sendable_campaigns.organization_id,
    sendable_campaigns.limit_assignment_to_teams,
    sendable_campaigns.autosend_status
   FROM public.sendable_campaigns
  WHERE sendable_campaigns.is_autoassign_enabled;


ALTER TABLE public.assignable_campaigns OWNER TO postgres;

--
-- Name: assignable_needs_message; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.assignable_needs_message AS
 SELECT acc.id,
    acc.campaign_id,
    acc.message_status
   FROM (public.assignable_campaign_contacts acc
     JOIN public.campaign ON ((campaign.id = acc.campaign_id)))
  WHERE ((acc.message_status = 'needsMessage'::text) AND (((acc.contact_timezone IS NULL) AND (EXTRACT(hour FROM (CURRENT_TIMESTAMP AT TIME ZONE campaign.timezone)) < (campaign.texting_hours_end)::numeric) AND (EXTRACT(hour FROM (CURRENT_TIMESTAMP AT TIME ZONE campaign.timezone)) >= (campaign.texting_hours_start)::numeric)) OR (((campaign.texting_hours_end)::numeric > EXTRACT(hour FROM ((CURRENT_TIMESTAMP AT TIME ZONE acc.contact_timezone) + '00:10:00'::interval))) AND ((campaign.texting_hours_start)::numeric <= EXTRACT(hour FROM (CURRENT_TIMESTAMP AT TIME ZONE acc.contact_timezone))))));


ALTER TABLE public.assignable_needs_message OWNER TO postgres;

--
-- Name: assignable_campaigns_with_needs_message; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.assignable_campaigns_with_needs_message AS
 SELECT assignable_campaigns.id,
    assignable_campaigns.title,
    assignable_campaigns.organization_id,
    assignable_campaigns.limit_assignment_to_teams,
    assignable_campaigns.autosend_status
   FROM public.assignable_campaigns
  WHERE ((EXISTS ( SELECT 1
           FROM public.assignable_needs_message
          WHERE (assignable_needs_message.campaign_id = assignable_campaigns.id))) AND (NOT (EXISTS ( SELECT 1
           FROM public.campaign
          WHERE ((campaign.id = assignable_campaigns.id) AND (now() > date_trunc('day'::text, ((campaign.due_by + '24:00:00'::interval) AT TIME ZONE campaign.timezone))))))) AND (assignable_campaigns.autosend_status <> 'sending'::text));


ALTER TABLE public.assignable_campaigns_with_needs_message OWNER TO postgres;

--
-- Name: assignable_needs_reply; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.assignable_needs_reply AS
 SELECT acc.id,
    acc.campaign_id,
    acc.message_status
   FROM (public.assignable_campaign_contacts acc
     JOIN public.campaign ON ((campaign.id = acc.campaign_id)))
  WHERE ((acc.message_status = 'needsResponse'::text) AND (((acc.contact_timezone IS NULL) AND (EXTRACT(hour FROM (CURRENT_TIMESTAMP AT TIME ZONE campaign.timezone)) < (campaign.texting_hours_end)::numeric) AND (EXTRACT(hour FROM (CURRENT_TIMESTAMP AT TIME ZONE campaign.timezone)) >= (campaign.texting_hours_start)::numeric)) OR (((campaign.texting_hours_end)::numeric > EXTRACT(hour FROM ((CURRENT_TIMESTAMP AT TIME ZONE acc.contact_timezone) + '00:02:00'::interval))) AND ((campaign.texting_hours_start)::numeric <= EXTRACT(hour FROM (CURRENT_TIMESTAMP AT TIME ZONE acc.contact_timezone))))));


ALTER TABLE public.assignable_needs_reply OWNER TO postgres;

--
-- Name: assignable_campaigns_with_needs_reply; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.assignable_campaigns_with_needs_reply AS
 SELECT assignable_campaigns.id,
    assignable_campaigns.title,
    assignable_campaigns.organization_id,
    assignable_campaigns.limit_assignment_to_teams,
    assignable_campaigns.autosend_status
   FROM public.assignable_campaigns
  WHERE (EXISTS ( SELECT 1
           FROM public.assignable_needs_reply
          WHERE (assignable_needs_reply.campaign_id = assignable_campaigns.id)));


ALTER TABLE public.assignable_campaigns_with_needs_reply OWNER TO postgres;

--
-- Name: assignable_needs_reply_with_escalation_tags; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.assignable_needs_reply_with_escalation_tags AS
 SELECT acc.id,
    acc.campaign_id,
    acc.message_status,
    acc.applied_escalation_tags
   FROM (public.assignable_campaign_contacts_with_escalation_tags acc
     JOIN public.campaign ON ((campaign.id = acc.campaign_id)))
  WHERE ((acc.message_status = 'needsResponse'::text) AND (((acc.contact_timezone IS NULL) AND (EXTRACT(hour FROM (CURRENT_TIMESTAMP AT TIME ZONE campaign.timezone)) < (campaign.texting_hours_end)::numeric) AND (EXTRACT(hour FROM (CURRENT_TIMESTAMP AT TIME ZONE campaign.timezone)) >= (campaign.texting_hours_start)::numeric)) OR (((campaign.texting_hours_end)::numeric > EXTRACT(hour FROM ((CURRENT_TIMESTAMP AT TIME ZONE acc.contact_timezone) + '00:02:00'::interval))) AND ((campaign.texting_hours_start)::numeric <= EXTRACT(hour FROM (CURRENT_TIMESTAMP AT TIME ZONE acc.contact_timezone))))));


ALTER TABLE public.assignable_needs_reply_with_escalation_tags OWNER TO postgres;

--
-- Name: assignment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.assignment (
    id integer NOT NULL,
    user_id integer NOT NULL,
    campaign_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    max_contacts integer,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.assignment OWNER TO postgres;

--
-- Name: assignment_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.assignment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.assignment_id_seq OWNER TO postgres;

--
-- Name: assignment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.assignment_id_seq OWNED BY public.assignment.id;


--
-- Name: assignment_request; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.assignment_request (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    organization_id integer,
    status text DEFAULT 'pending'::text,
    user_id integer NOT NULL,
    amount integer NOT NULL,
    approved_by_user_id integer,
    preferred_team_id integer,
    CONSTRAINT assignment_request_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
)
WITH (autovacuum_vacuum_scale_factor='0', autovacuum_vacuum_threshold='5000');


ALTER TABLE public.assignment_request OWNER TO postgres;

--
-- Name: assignment_request_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.assignment_request_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.assignment_request_id_seq OWNER TO postgres;

--
-- Name: assignment_request_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.assignment_request_id_seq OWNED BY public.assignment_request.id;


--
-- Name: autosend_campaigns_to_send; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.autosend_campaigns_to_send AS
 SELECT sendable_campaigns.id,
    sendable_campaigns.title,
    sendable_campaigns.organization_id,
    sendable_campaigns.limit_assignment_to_teams,
    sendable_campaigns.autosend_status,
    sendable_campaigns.is_autoassign_enabled
   FROM public.sendable_campaigns
  WHERE ((EXISTS ( SELECT 1
           FROM public.assignable_needs_message
          WHERE (assignable_needs_message.campaign_id = sendable_campaigns.id))) AND (NOT (EXISTS ( SELECT 1
           FROM public.campaign
          WHERE ((campaign.id = sendable_campaigns.id) AND (now() > date_trunc('day'::text, ((campaign.due_by + '24:00:00'::interval) AT TIME ZONE campaign.timezone))))))) AND (sendable_campaigns.autosend_status = 'sending'::text));


ALTER TABLE public.autosend_campaigns_to_send OWNER TO postgres;

--
-- Name: campaign_contact_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.campaign_contact_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.campaign_contact_id_seq OWNER TO postgres;

--
-- Name: campaign_contact_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.campaign_contact_id_seq OWNED BY public.campaign_contact.id;


--
-- Name: campaign_contact_upload; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.campaign_contact_upload (
    campaign_id integer NOT NULL,
    column_mapping json,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.campaign_contact_upload OWNER TO postgres;

--
-- Name: campaign_group; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.campaign_group (
    id integer NOT NULL,
    organization_id integer NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.campaign_group OWNER TO postgres;

--
-- Name: campaign_group_campaign; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.campaign_group_campaign (
    id integer NOT NULL,
    campaign_group_id integer NOT NULL,
    campaign_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.campaign_group_campaign OWNER TO postgres;

--
-- Name: campaign_group_campaign_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.campaign_group_campaign_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.campaign_group_campaign_id_seq OWNER TO postgres;

--
-- Name: campaign_group_campaign_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.campaign_group_campaign_id_seq OWNED BY public.campaign_group_campaign.id;


--
-- Name: campaign_group_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.campaign_group_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.campaign_group_id_seq OWNER TO postgres;

--
-- Name: campaign_group_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.campaign_group_id_seq OWNED BY public.campaign_group.id;


--
-- Name: campaign_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.campaign_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.campaign_id_seq OWNER TO postgres;

--
-- Name: campaign_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.campaign_id_seq OWNED BY public.all_campaign.id;


--
-- Name: campaign_team; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.campaign_team (
    campaign_id integer,
    team_id integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    id integer NOT NULL
);


ALTER TABLE public.campaign_team OWNER TO postgres;

--
-- Name: campaign_team_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.campaign_team_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.campaign_team_id_seq OWNER TO postgres;

--
-- Name: campaign_team_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.campaign_team_id_seq OWNED BY public.campaign_team.id;


--
-- Name: campaign_variable; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.campaign_variable (
    id integer NOT NULL,
    campaign_id integer NOT NULL,
    display_order integer NOT NULL,
    name text NOT NULL,
    value text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT check_name CHECK ((name ~ '^cv:[a-zA-Z0-9 \-_]+$'::text))
);


ALTER TABLE public.campaign_variable OWNER TO postgres;

--
-- Name: campaign_variable_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.campaign_variable_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.campaign_variable_id_seq OWNER TO postgres;

--
-- Name: campaign_variable_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.campaign_variable_id_seq OWNED BY public.campaign_variable.id;


--
-- Name: canned_response; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.canned_response (
    id integer NOT NULL,
    campaign_id integer NOT NULL,
    text text NOT NULL,
    title text NOT NULL,
    user_id integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    display_order integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.canned_response OWNER TO postgres;

--
-- Name: canned_response_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.canned_response_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.canned_response_id_seq OWNER TO postgres;

--
-- Name: canned_response_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.canned_response_id_seq OWNED BY public.canned_response.id;


--
-- Name: deliverability_report; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.deliverability_report (
    id integer NOT NULL,
    period_starts_at timestamp with time zone,
    period_ends_at timestamp with time zone,
    computed_at timestamp with time zone,
    count_total integer,
    count_delivered integer,
    count_sent integer,
    count_error integer,
    domain character varying(191),
    url_path character varying(191)
);


ALTER TABLE public.deliverability_report OWNER TO postgres;

--
-- Name: deliverability_report_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.deliverability_report_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.deliverability_report_id_seq OWNER TO postgres;

--
-- Name: deliverability_report_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.deliverability_report_id_seq OWNED BY public.deliverability_report.id;


--
-- Name: external_activist_code; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.external_activist_code (
    id uuid DEFAULT public.uuid_generate_v1mc() NOT NULL,
    system_id uuid NOT NULL,
    external_id integer NOT NULL,
    type text,
    name text,
    medium_name text,
    short_name text,
    description text,
    script_question text,
    status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT external_activist_code_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text, 'inactive'::text])))
);


ALTER TABLE public.external_activist_code OWNER TO postgres;

--
-- Name: external_list; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.external_list (
    system_id uuid NOT NULL,
    external_id integer NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    list_count integer NOT NULL,
    door_count integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.external_list OWNER TO postgres;

--
-- Name: external_result_code; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.external_result_code (
    id uuid DEFAULT public.uuid_generate_v1mc() NOT NULL,
    system_id uuid NOT NULL,
    external_id integer NOT NULL,
    name text,
    medium_name text,
    short_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.external_result_code OWNER TO postgres;

--
-- Name: external_survey_question; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.external_survey_question (
    id uuid DEFAULT public.uuid_generate_v1mc() NOT NULL,
    system_id uuid NOT NULL,
    external_id integer NOT NULL,
    type text,
    cycle integer,
    name text,
    medium_name text,
    short_name text,
    script_question text,
    status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT external_survey_question_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text, 'inactive'::text])))
);


ALTER TABLE public.external_survey_question OWNER TO postgres;

--
-- Name: external_survey_question_response_option; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.external_survey_question_response_option (
    id uuid DEFAULT public.uuid_generate_v1mc() NOT NULL,
    external_survey_question_id uuid NOT NULL,
    external_id integer NOT NULL,
    name text,
    medium_name text,
    short_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.external_survey_question_response_option OWNER TO postgres;

--
-- Name: external_sync_config_question_response_activist_code; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.external_sync_config_question_response_activist_code (
    id uuid DEFAULT public.uuid_generate_v1mc() NOT NULL,
    question_response_config_id uuid NOT NULL,
    external_activist_code_id uuid NOT NULL
);


ALTER TABLE public.external_sync_config_question_response_activist_code OWNER TO postgres;

--
-- Name: external_sync_config_question_response_response_option; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.external_sync_config_question_response_response_option (
    id uuid DEFAULT public.uuid_generate_v1mc() NOT NULL,
    question_response_config_id uuid NOT NULL,
    external_response_option_id uuid NOT NULL
);


ALTER TABLE public.external_sync_config_question_response_response_option OWNER TO postgres;

--
-- Name: external_sync_config_question_response_result_code; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.external_sync_config_question_response_result_code (
    id uuid DEFAULT public.uuid_generate_v1mc() NOT NULL,
    question_response_config_id uuid NOT NULL,
    external_result_code_id uuid NOT NULL
);


ALTER TABLE public.external_sync_config_question_response_result_code OWNER TO postgres;

--
-- Name: external_sync_opt_out_configuration; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.external_sync_opt_out_configuration (
    id uuid DEFAULT public.uuid_generate_v1mc() NOT NULL,
    system_id uuid NOT NULL,
    external_result_code_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.external_sync_opt_out_configuration OWNER TO postgres;

--
-- Name: external_system; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.external_system (
    id uuid DEFAULT public.uuid_generate_v1mc() NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    api_key_ref text NOT NULL,
    organization_id integer,
    username text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    synced_at timestamp with time zone
);


ALTER TABLE public.external_system OWNER TO postgres;

--
-- Name: interaction_step; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.interaction_step (
    id integer NOT NULL,
    campaign_id integer NOT NULL,
    question text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    parent_interaction_id integer,
    answer_option text DEFAULT ''::text NOT NULL,
    answer_actions text DEFAULT ''::text NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    script_options text[] NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.interaction_step OWNER TO postgres;

--
-- Name: question_response; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.question_response AS
 SELECT all_question_response.id,
    all_question_response.campaign_contact_id,
    all_question_response.interaction_step_id,
    all_question_response.value,
    all_question_response.created_at,
    all_question_response.is_deleted,
    all_question_response.updated_at
   FROM public.all_question_response
  WHERE (all_question_response.is_deleted = false);


ALTER TABLE public.question_response OWNER TO postgres;

--
-- Name: missing_external_sync_question_response_configuration; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.missing_external_sync_question_response_configuration AS
 SELECT all_values.campaign_id,
    all_values.interaction_step_id,
    all_values.value,
    all_values.is_required,
    external_system.id AS system_id
   FROM ((( SELECT istep.campaign_id,
            istep.parent_interaction_id AS interaction_step_id,
            istep.answer_option AS value,
            (EXISTS ( SELECT 1
                   FROM public.question_response istep_qr
                  WHERE ((istep_qr.interaction_step_id = istep.parent_interaction_id) AND (istep_qr.value = istep.answer_option)))) AS is_required
           FROM public.interaction_step istep
          WHERE (istep.parent_interaction_id IS NOT NULL)
        UNION
         SELECT qr_istep.campaign_id,
            qr.interaction_step_id,
            qr.value,
            true AS is_required
           FROM (public.question_response qr
             JOIN public.interaction_step qr_istep ON ((qr_istep.id = qr.interaction_step_id)))) all_values
     JOIN public.campaign ON ((campaign.id = all_values.campaign_id)))
     JOIN public.external_system ON ((external_system.organization_id = campaign.organization_id)))
  WHERE (NOT (EXISTS ( SELECT 1
           FROM public.all_external_sync_question_response_configuration aqrc
          WHERE ((all_values.campaign_id = aqrc.campaign_id) AND (external_system.id = aqrc.system_id) AND (all_values.interaction_step_id = aqrc.interaction_step_id) AND (all_values.value = aqrc.question_response_value)))));


ALTER TABLE public.missing_external_sync_question_response_configuration OWNER TO postgres;

--
-- Name: external_sync_question_response_configuration; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.external_sync_question_response_configuration AS
 SELECT (aqrc.id)::text AS compound_id,
    aqrc.campaign_id,
    aqrc.system_id,
    aqrc.interaction_step_id,
    aqrc.question_response_value,
    aqrc.created_at,
    aqrc.updated_at,
    (NOT (EXISTS ( SELECT 1
           FROM public.external_sync_config_question_response_response_option qrro
          WHERE (qrro.question_response_config_id = aqrc.id)
        UNION
         SELECT 1
           FROM public.external_sync_config_question_response_activist_code qrac
          WHERE (qrac.question_response_config_id = aqrc.id)
        UNION
         SELECT 1
           FROM public.external_sync_config_question_response_result_code qrrc
          WHERE (qrrc.question_response_config_id = aqrc.id)))) AS is_empty,
    (EXISTS ( SELECT 1
           FROM ((public.external_sync_config_question_response_response_option qrro
             JOIN public.external_survey_question_response_option ON ((external_survey_question_response_option.id = qrro.external_response_option_id)))
             JOIN public.external_survey_question ON ((external_survey_question.id = external_survey_question_response_option.external_survey_question_id)))
          WHERE ((qrro.question_response_config_id = aqrc.id) AND (external_survey_question.status <> 'active'::text))
        UNION
         SELECT 1
           FROM (public.external_sync_config_question_response_activist_code qrac
             JOIN public.external_activist_code ON ((external_activist_code.id = qrac.external_activist_code_id)))
          WHERE ((qrac.question_response_config_id = aqrc.id) AND (external_activist_code.status <> 'active'::text)))) AS includes_not_active,
    false AS is_missing,
    false AS is_required
   FROM public.all_external_sync_question_response_configuration aqrc
UNION
 SELECT ((((missing.value || '|'::text) || missing.interaction_step_id) || '|'::text) || missing.campaign_id) AS compound_id,
    missing.campaign_id,
    missing.system_id,
    missing.interaction_step_id,
    missing.value AS question_response_value,
    NULL::timestamp with time zone AS created_at,
    NULL::timestamp with time zone AS updated_at,
    true AS is_empty,
    false AS includes_not_active,
    true AS is_missing,
    missing.is_required
   FROM public.missing_external_sync_question_response_configuration missing;


ALTER TABLE public.external_sync_question_response_configuration OWNER TO postgres;

--
-- Name: filtered_contact; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.filtered_contact (
    id integer NOT NULL,
    campaign_id integer NOT NULL,
    external_id text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    cell text NOT NULL,
    zip text NOT NULL,
    custom_fields text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    timezone character varying(255),
    filtered_reason text NOT NULL,
    CONSTRAINT filtered_contact_filtered_reason_check CHECK ((filtered_reason = ANY (ARRAY['INVALID'::text, 'LANDLINE'::text, 'VOIP'::text, 'OPTEDOUT'::text])))
);


ALTER TABLE public.filtered_contact OWNER TO postgres;

--
-- Name: filtered_contact_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.filtered_contact_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.filtered_contact_id_seq OWNER TO postgres;

--
-- Name: filtered_contact_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.filtered_contact_id_seq OWNED BY public.filtered_contact.id;


--
-- Name: instance_setting; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.instance_setting (
    name text NOT NULL,
    type text DEFAULT 'string'::text,
    value text NOT NULL
);


ALTER TABLE public.instance_setting OWNER TO postgres;

--
-- Name: interaction_step_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.interaction_step_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.interaction_step_id_seq OWNER TO postgres;

--
-- Name: interaction_step_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.interaction_step_id_seq OWNED BY public.interaction_step.id;


--
-- Name: invite; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invite (
    id integer NOT NULL,
    is_valid boolean NOT NULL,
    hash text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    payload json DEFAULT '{}'::json NOT NULL
);


ALTER TABLE public.invite OWNER TO postgres;

--
-- Name: invite_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.invite_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.invite_id_seq OWNER TO postgres;

--
-- Name: invite_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.invite_id_seq OWNED BY public.invite.id;


--
-- Name: job_request; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.job_request (
    id integer NOT NULL,
    campaign_id integer NOT NULL,
    payload text NOT NULL,
    queue_name text NOT NULL,
    job_type text NOT NULL,
    result_message text DEFAULT ''::text,
    locks_queue boolean DEFAULT false,
    assigned boolean DEFAULT false,
    status integer DEFAULT 0,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.job_request OWNER TO postgres;

--
-- Name: job_request_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.job_request_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.job_request_id_seq OWNER TO postgres;

--
-- Name: job_request_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.job_request_id_seq OWNED BY public.job_request.id;


--
-- Name: knex_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


ALTER TABLE public.knex_migrations OWNER TO postgres;

--
-- Name: knex_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.knex_migrations_id_seq OWNER TO postgres;

--
-- Name: knex_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_id_seq OWNED BY public.knex_migrations.id;


--
-- Name: knex_migrations_lock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_lock (
    index integer NOT NULL,
    is_locked integer
);


ALTER TABLE public.knex_migrations_lock OWNER TO postgres;

--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.knex_migrations_lock_index_seq OWNER TO postgres;

--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_lock_index_seq OWNED BY public.knex_migrations_lock.index;


--
-- Name: link_domain; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.link_domain (
    id integer NOT NULL,
    organization_id integer NOT NULL,
    domain text NOT NULL,
    max_usage_count integer NOT NULL,
    current_usage_count integer DEFAULT 0 NOT NULL,
    is_manually_disabled boolean DEFAULT false NOT NULL,
    cycled_out_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.link_domain OWNER TO postgres;

--
-- Name: link_domain_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.link_domain_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.link_domain_id_seq OWNER TO postgres;

--
-- Name: link_domain_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.link_domain_id_seq OWNED BY public.link_domain.id;


--
-- Name: log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.log (
    id integer NOT NULL,
    message_sid text NOT NULL,
    body text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    service_type public.messaging_service_type
);


ALTER TABLE public.log OWNER TO postgres;

--
-- Name: log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.log_id_seq OWNER TO postgres;

--
-- Name: log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.log_id_seq OWNED BY public.log.id;


--
-- Name: message; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.message (
    id integer NOT NULL,
    user_number text DEFAULT ''::text NOT NULL,
    user_id integer,
    contact_number text NOT NULL,
    is_from_contact boolean NOT NULL,
    text text DEFAULT ''::text NOT NULL,
    service_response text DEFAULT '[]'::text,
    assignment_id integer NOT NULL,
    service text DEFAULT ''::text NOT NULL,
    service_id text DEFAULT ''::text NOT NULL,
    send_status text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    queued_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    sent_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    service_response_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    send_before timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    campaign_contact_id integer,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    script_version_hash character varying(255),
    error_codes text[],
    num_segments smallint,
    num_media smallint,
    campaign_variable_ids integer[] DEFAULT '{}'::integer[] NOT NULL,
    CONSTRAINT message_send_status_check CHECK ((send_status = ANY (ARRAY['QUEUED'::text, 'SENDING'::text, 'SENT'::text, 'DELIVERED'::text, 'ERROR'::text, 'PAUSED'::text, 'NOT_ATTEMPTED'::text])))
)
WITH (autovacuum_vacuum_scale_factor='0', autovacuum_vacuum_threshold='20000', fillfactor='85');


ALTER TABLE public.message OWNER TO postgres;

--
-- Name: message_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.message_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.message_id_seq OWNER TO postgres;

--
-- Name: message_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.message_id_seq OWNED BY public.message.id;


--
-- Name: messaging_service_stick; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.messaging_service_stick (
    cell text NOT NULL,
    organization_id integer NOT NULL,
    messaging_service_sid text NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
)
WITH (autovacuum_vacuum_scale_factor='0', autovacuum_vacuum_threshold='20000');


ALTER TABLE public.messaging_service_stick OWNER TO postgres;

--
-- Name: monthly_organization_message_usages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.monthly_organization_message_usages (
    month date NOT NULL,
    organization_id integer NOT NULL,
    sent_message_count bigint
);


ALTER TABLE public.monthly_organization_message_usages OWNER TO postgres;

--
-- Name: notification; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification (
    id integer NOT NULL,
    user_id integer NOT NULL,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    organization_id integer,
    campaign_id integer,
    notification_type character varying(255) DEFAULT ''::character varying NOT NULL
);


ALTER TABLE public.notification OWNER TO postgres;

--
-- Name: notification_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.notification_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.notification_id_seq OWNER TO postgres;

--
-- Name: notification_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.notification_id_seq OWNED BY public.notification.id;


--
-- Name: opt_out; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.opt_out (
    id integer NOT NULL,
    cell text NOT NULL,
    assignment_id integer,
    organization_id integer NOT NULL,
    reason_code text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.opt_out OWNER TO postgres;

--
-- Name: opt_out_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.opt_out_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.opt_out_id_seq OWNER TO postgres;

--
-- Name: opt_out_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.opt_out_id_seq OWNED BY public.opt_out.id;


--
-- Name: organization; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.organization (
    id integer NOT NULL,
    uuid text,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    features text DEFAULT ''::text,
    texting_hours_enforced boolean DEFAULT false,
    texting_hours_start integer DEFAULT 9,
    texting_hours_end integer DEFAULT 21,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    monthly_message_limit bigint,
    default_texting_tz character varying(255) DEFAULT 'America/New_York'::character varying NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by integer,
    autosending_mps integer
);


ALTER TABLE public.organization OWNER TO postgres;

--
-- Name: organization_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.organization_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.organization_id_seq OWNER TO postgres;

--
-- Name: organization_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.organization_id_seq OWNED BY public.organization.id;


--
-- Name: password_reset_request; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.password_reset_request (
    id integer NOT NULL,
    email text,
    token text DEFAULT encode(public.gen_random_bytes(10), 'hex'::text),
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval)
);


ALTER TABLE public.password_reset_request OWNER TO postgres;

--
-- Name: password_reset_request_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.password_reset_request_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.password_reset_request_id_seq OWNER TO postgres;

--
-- Name: password_reset_request_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.password_reset_request_id_seq OWNED BY public.password_reset_request.id;


--
-- Name: pending_message_part; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pending_message_part (
    id integer NOT NULL,
    service text NOT NULL,
    service_id text NOT NULL,
    parent_id text DEFAULT ''::text,
    service_message text NOT NULL,
    user_number text DEFAULT ''::text NOT NULL,
    contact_number text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.pending_message_part OWNER TO postgres;

--
-- Name: pending_message_part_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pending_message_part_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.pending_message_part_id_seq OWNER TO postgres;

--
-- Name: pending_message_part_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pending_message_part_id_seq OWNED BY public.pending_message_part.id;


--
-- Name: question_response_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.question_response_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.question_response_id_seq OWNER TO postgres;

--
-- Name: question_response_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.question_response_id_seq OWNED BY public.all_question_response.id;


--
-- Name: tag_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tag_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.tag_id_seq OWNER TO postgres;

--
-- Name: tag_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tag_id_seq OWNED BY public.all_tag.id;


--
-- Name: team; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.team (
    id integer NOT NULL,
    organization_id integer NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    text_color text DEFAULT '#000000'::text NOT NULL,
    background_color text DEFAULT '#000000'::text NOT NULL,
    assignment_priority integer DEFAULT 500,
    author_id integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_assignment_enabled boolean DEFAULT false,
    assignment_type text,
    max_request_count integer,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT team_assignment_type_check CHECK ((assignment_type = ANY (ARRAY['UNSENT'::text, 'UNREPLIED'::text])))
);


ALTER TABLE public.team OWNER TO postgres;

--
-- Name: team_escalation_tags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.team_escalation_tags (
    team_id integer,
    tag_id integer,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    id integer NOT NULL
);


ALTER TABLE public.team_escalation_tags OWNER TO postgres;

--
-- Name: team_escalation_tags_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.team_escalation_tags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.team_escalation_tags_id_seq OWNER TO postgres;

--
-- Name: team_escalation_tags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.team_escalation_tags_id_seq OWNED BY public.team_escalation_tags.id;


--
-- Name: team_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.team_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.team_id_seq OWNER TO postgres;

--
-- Name: team_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.team_id_seq OWNED BY public.team.id;


--
-- Name: troll_trigger; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.troll_trigger (
    token character varying(255) NOT NULL,
    organization_id integer NOT NULL,
    mode text DEFAULT 'english'::text NOT NULL,
    compiled_tsquery tsquery GENERATED ALWAYS AS (to_tsquery(public.regconfig_mode(mode), (token)::text)) STORED,
    CONSTRAINT valid_regconfig CHECK ((mode = ((mode)::regconfig)::text))
);


ALTER TABLE public.troll_trigger OWNER TO postgres;

--
-- Name: unhealthy_link_domain; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.unhealthy_link_domain (
    id integer NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    healthy_again_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.unhealthy_link_domain OWNER TO postgres;

--
-- Name: unhealthy_link_domain_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.unhealthy_link_domain_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.unhealthy_link_domain_id_seq OWNER TO postgres;

--
-- Name: unhealthy_link_domain_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.unhealthy_link_domain_id_seq OWNED BY public.unhealthy_link_domain.id;


--
-- Name: unsolicited_message; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.unsolicited_message (
    id integer NOT NULL,
    messaging_service_sid text NOT NULL,
    service_id text NOT NULL,
    from_number text NOT NULL,
    body text NOT NULL,
    num_segments integer NOT NULL,
    num_media integer NOT NULL,
    media_urls text[] DEFAULT '{}'::text[] NOT NULL,
    service_response json NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.unsolicited_message OWNER TO postgres;

--
-- Name: unsolicited_message_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.unsolicited_message_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.unsolicited_message_id_seq OWNER TO postgres;

--
-- Name: unsolicited_message_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.unsolicited_message_id_seq OWNED BY public.unsolicited_message.id;


--
-- Name: user; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."user" (
    id integer NOT NULL,
    auth0_id text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    cell text NOT NULL,
    email public.citext NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    assigned_cell text,
    is_superadmin boolean,
    terms boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    notification_frequency text DEFAULT 'DAILY'::text NOT NULL,
    is_suspended boolean DEFAULT false NOT NULL,
    CONSTRAINT user_notification_frequency_check CHECK ((notification_frequency = ANY (ARRAY['ALL'::text, 'PERIODIC'::text, 'DAILY'::text, 'NONE'::text])))
);


ALTER TABLE public."user" OWNER TO postgres;

--
-- Name: user_cell; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_cell (
    id integer NOT NULL,
    cell text NOT NULL,
    user_id integer NOT NULL,
    service text,
    is_primary boolean,
    CONSTRAINT user_cell_service_check CHECK ((service = ANY (ARRAY['nexmo'::text, 'twilio'::text])))
);


ALTER TABLE public.user_cell OWNER TO postgres;

--
-- Name: user_cell_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_cell_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.user_cell_id_seq OWNER TO postgres;

--
-- Name: user_cell_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_cell_id_seq OWNED BY public.user_cell.id;


--
-- Name: user_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.user_id_seq OWNER TO postgres;

--
-- Name: user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_id_seq OWNED BY public."user".id;


--
-- Name: user_organization; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_organization (
    id integer NOT NULL,
    user_id integer NOT NULL,
    organization_id integer NOT NULL,
    role text NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    request_status public.texter_status DEFAULT 'approval_required'::public.texter_status NOT NULL,
    CONSTRAINT user_organization_role_check CHECK ((role = ANY (ARRAY['OWNER'::text, 'ADMIN'::text, 'SUPERVOLUNTEER'::text, 'TEXTER'::text, 'SUSPENDED'::text])))
);


ALTER TABLE public.user_organization OWNER TO postgres;

--
-- Name: user_organization_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_organization_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.user_organization_id_seq OWNER TO postgres;

--
-- Name: user_organization_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_organization_id_seq OWNED BY public.user_organization.id;


--
-- Name: user_session; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_session (
    sid text NOT NULL,
    sess json NOT NULL,
    expire timestamp with time zone NOT NULL,
    user_id integer GENERATED ALWAYS AS ((((sess -> 'passport'::text) ->> 'user'::text))::integer) STORED
);


ALTER TABLE public.user_session OWNER TO postgres;

--
-- Name: user_team; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_team (
    user_id integer,
    team_id integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    id integer NOT NULL
);


ALTER TABLE public.user_team OWNER TO postgres;

--
-- Name: user_team_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_team_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.user_team_id_seq OWNER TO postgres;

--
-- Name: user_team_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_team_id_seq OWNED BY public.user_team.id;


--
-- Name: zip_code; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.zip_code (
    zip text NOT NULL,
    city text NOT NULL,
    state text NOT NULL,
    latitude real NOT NULL,
    longitude real NOT NULL,
    timezone_offset real NOT NULL,
    has_dst boolean NOT NULL
);


ALTER TABLE public.zip_code OWNER TO postgres;

--
-- Name: action_external_system_sync id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.action_external_system_sync ALTER COLUMN id SET DEFAULT nextval('public.action_external_system_sync_id_seq'::regclass);


--
-- Name: all_campaign id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.all_campaign ALTER COLUMN id SET DEFAULT nextval('public.campaign_id_seq'::regclass);


--
-- Name: all_question_response id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.all_question_response ALTER COLUMN id SET DEFAULT nextval('public.question_response_id_seq'::regclass);


--
-- Name: all_tag id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.all_tag ALTER COLUMN id SET DEFAULT nextval('public.tag_id_seq'::regclass);


--
-- Name: assignment id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assignment ALTER COLUMN id SET DEFAULT nextval('public.assignment_id_seq'::regclass);


--
-- Name: assignment_request id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assignment_request ALTER COLUMN id SET DEFAULT nextval('public.assignment_request_id_seq'::regclass);


--
-- Name: campaign_contact id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_contact ALTER COLUMN id SET DEFAULT nextval('public.campaign_contact_id_seq'::regclass);


--
-- Name: campaign_group id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_group ALTER COLUMN id SET DEFAULT nextval('public.campaign_group_id_seq'::regclass);


--
-- Name: campaign_group_campaign id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_group_campaign ALTER COLUMN id SET DEFAULT nextval('public.campaign_group_campaign_id_seq'::regclass);


--
-- Name: campaign_team id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_team ALTER COLUMN id SET DEFAULT nextval('public.campaign_team_id_seq'::regclass);


--
-- Name: campaign_variable id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_variable ALTER COLUMN id SET DEFAULT nextval('public.campaign_variable_id_seq'::regclass);


--
-- Name: canned_response id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.canned_response ALTER COLUMN id SET DEFAULT nextval('public.canned_response_id_seq'::regclass);


--
-- Name: deliverability_report id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliverability_report ALTER COLUMN id SET DEFAULT nextval('public.deliverability_report_id_seq'::regclass);


--
-- Name: filtered_contact id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.filtered_contact ALTER COLUMN id SET DEFAULT nextval('public.filtered_contact_id_seq'::regclass);


--
-- Name: interaction_step id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.interaction_step ALTER COLUMN id SET DEFAULT nextval('public.interaction_step_id_seq'::regclass);


--
-- Name: invite id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invite ALTER COLUMN id SET DEFAULT nextval('public.invite_id_seq'::regclass);


--
-- Name: job_request id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.job_request ALTER COLUMN id SET DEFAULT nextval('public.job_request_id_seq'::regclass);


--
-- Name: knex_migrations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_id_seq'::regclass);


--
-- Name: knex_migrations_lock index; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_lock_index_seq'::regclass);


--
-- Name: link_domain id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.link_domain ALTER COLUMN id SET DEFAULT nextval('public.link_domain_id_seq'::regclass);


--
-- Name: log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.log ALTER COLUMN id SET DEFAULT nextval('public.log_id_seq'::regclass);


--
-- Name: message id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.message ALTER COLUMN id SET DEFAULT nextval('public.message_id_seq'::regclass);


--
-- Name: notification id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification ALTER COLUMN id SET DEFAULT nextval('public.notification_id_seq'::regclass);


--
-- Name: opt_out id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opt_out ALTER COLUMN id SET DEFAULT nextval('public.opt_out_id_seq'::regclass);


--
-- Name: organization id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization ALTER COLUMN id SET DEFAULT nextval('public.organization_id_seq'::regclass);


--
-- Name: password_reset_request id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_request ALTER COLUMN id SET DEFAULT nextval('public.password_reset_request_id_seq'::regclass);


--
-- Name: pending_message_part id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pending_message_part ALTER COLUMN id SET DEFAULT nextval('public.pending_message_part_id_seq'::regclass);


--
-- Name: team id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team ALTER COLUMN id SET DEFAULT nextval('public.team_id_seq'::regclass);


--
-- Name: team_escalation_tags id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_escalation_tags ALTER COLUMN id SET DEFAULT nextval('public.team_escalation_tags_id_seq'::regclass);


--
-- Name: unhealthy_link_domain id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.unhealthy_link_domain ALTER COLUMN id SET DEFAULT nextval('public.unhealthy_link_domain_id_seq'::regclass);


--
-- Name: unsolicited_message id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.unsolicited_message ALTER COLUMN id SET DEFAULT nextval('public.unsolicited_message_id_seq'::regclass);


--
-- Name: user id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."user" ALTER COLUMN id SET DEFAULT nextval('public.user_id_seq'::regclass);


--
-- Name: user_cell id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_cell ALTER COLUMN id SET DEFAULT nextval('public.user_cell_id_seq'::regclass);


--
-- Name: user_organization id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_organization ALTER COLUMN id SET DEFAULT nextval('public.user_organization_id_seq'::regclass);


--
-- Name: user_team id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_team ALTER COLUMN id SET DEFAULT nextval('public.user_team_id_seq'::regclass);


--
-- Name: action_external_system_sync action_external_system_sync_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.action_external_system_sync
    ADD CONSTRAINT action_external_system_sync_pkey PRIMARY KEY (id);


--
-- Name: all_external_sync_question_response_configuration all_external_sync_question_re_question_response_value_inter_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.all_external_sync_question_response_configuration
    ADD CONSTRAINT all_external_sync_question_re_question_response_value_inter_key UNIQUE (question_response_value, interaction_step_id, campaign_id, system_id);


--
-- Name: all_external_sync_question_response_configuration all_external_sync_question_response_configuration_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.all_external_sync_question_response_configuration
    ADD CONSTRAINT all_external_sync_question_response_configuration_pkey PRIMARY KEY (id);


--
-- Name: assignment assignment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assignment
    ADD CONSTRAINT assignment_pkey PRIMARY KEY (id);


--
-- Name: assignment_request assignment_request_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assignment_request
    ADD CONSTRAINT assignment_request_pkey PRIMARY KEY (id);


--
-- Name: assignment assignment_unqiue_user_campaign; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assignment
    ADD CONSTRAINT assignment_unqiue_user_campaign UNIQUE (user_id, campaign_id);


--
-- Name: campaign_contact campaign_contact_cell_campaign_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_contact
    ADD CONSTRAINT campaign_contact_cell_campaign_id_unique UNIQUE (cell, campaign_id);


--
-- Name: campaign_contact campaign_contact_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_contact
    ADD CONSTRAINT campaign_contact_pkey PRIMARY KEY (id);


--
-- Name: campaign_contact_tag campaign_contact_tag_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_contact_tag
    ADD CONSTRAINT campaign_contact_tag_pkey PRIMARY KEY (campaign_contact_id, tag_id);


--
-- Name: campaign_contact_upload campaign_contact_upload_campaign_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_contact_upload
    ADD CONSTRAINT campaign_contact_upload_campaign_id_unique UNIQUE (campaign_id);


--
-- Name: campaign_contact_upload campaign_contact_upload_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_contact_upload
    ADD CONSTRAINT campaign_contact_upload_pkey PRIMARY KEY (campaign_id);


--
-- Name: campaign_group_campaign campaign_group_campaign_campaign_group_id_campaign_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_group_campaign
    ADD CONSTRAINT campaign_group_campaign_campaign_group_id_campaign_id_key UNIQUE (campaign_group_id, campaign_id);


--
-- Name: campaign_group_campaign campaign_group_campaign_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_group_campaign
    ADD CONSTRAINT campaign_group_campaign_pkey PRIMARY KEY (id);


--
-- Name: campaign_group campaign_group_organization_id_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_group
    ADD CONSTRAINT campaign_group_organization_id_name_key UNIQUE (organization_id, name);


--
-- Name: campaign_group campaign_group_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_group
    ADD CONSTRAINT campaign_group_pkey PRIMARY KEY (id);


--
-- Name: all_campaign campaign_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.all_campaign
    ADD CONSTRAINT campaign_pkey PRIMARY KEY (id);


--
-- Name: campaign_team campaign_team_campaign_id_team_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_team
    ADD CONSTRAINT campaign_team_campaign_id_team_id_unique UNIQUE (campaign_id, team_id);


--
-- Name: campaign_team campaign_team_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_team
    ADD CONSTRAINT campaign_team_pkey PRIMARY KEY (id);


--
-- Name: campaign_variable campaign_variable_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_variable
    ADD CONSTRAINT campaign_variable_pkey PRIMARY KEY (id);


--
-- Name: canned_response canned_response_campaign_id_display_order_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.canned_response
    ADD CONSTRAINT canned_response_campaign_id_display_order_unique UNIQUE (campaign_id, display_order);


--
-- Name: canned_response canned_response_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.canned_response
    ADD CONSTRAINT canned_response_pkey PRIMARY KEY (id);


--
-- Name: deliverability_report deliverability_report_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliverability_report
    ADD CONSTRAINT deliverability_report_pkey PRIMARY KEY (id);


--
-- Name: user email_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT email_unique UNIQUE (email);


--
-- Name: external_activist_code external_activist_code_external_id_system_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_activist_code
    ADD CONSTRAINT external_activist_code_external_id_system_id_key UNIQUE (external_id, system_id);


--
-- Name: external_activist_code external_activist_code_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_activist_code
    ADD CONSTRAINT external_activist_code_pkey PRIMARY KEY (id);


--
-- Name: external_list external_list_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_list
    ADD CONSTRAINT external_list_pkey PRIMARY KEY (system_id, external_id);


--
-- Name: external_result_code external_result_code_external_id_system_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_result_code
    ADD CONSTRAINT external_result_code_external_id_system_id_key UNIQUE (external_id, system_id);


--
-- Name: external_result_code external_result_code_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_result_code
    ADD CONSTRAINT external_result_code_pkey PRIMARY KEY (id);


--
-- Name: external_survey_question external_survey_question_external_id_system_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_survey_question
    ADD CONSTRAINT external_survey_question_external_id_system_id_key UNIQUE (external_id, system_id);


--
-- Name: external_survey_question external_survey_question_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_survey_question
    ADD CONSTRAINT external_survey_question_pkey PRIMARY KEY (id);


--
-- Name: external_survey_question_response_option external_survey_question_resp_external_id_external_survey_q_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_survey_question_response_option
    ADD CONSTRAINT external_survey_question_resp_external_id_external_survey_q_key UNIQUE (external_id, external_survey_question_id);


--
-- Name: external_survey_question_response_option external_survey_question_response_option_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_survey_question_response_option
    ADD CONSTRAINT external_survey_question_response_option_pkey PRIMARY KEY (id);


--
-- Name: external_sync_config_question_response_activist_code external_sync_config_question_response_activist_code_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_sync_config_question_response_activist_code
    ADD CONSTRAINT external_sync_config_question_response_activist_code_pkey PRIMARY KEY (id);


--
-- Name: external_sync_config_question_response_response_option external_sync_config_question_response_response_option_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_sync_config_question_response_response_option
    ADD CONSTRAINT external_sync_config_question_response_response_option_pkey PRIMARY KEY (id);


--
-- Name: external_sync_config_question_response_result_code external_sync_config_question_response_result_code_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_sync_config_question_response_result_code
    ADD CONSTRAINT external_sync_config_question_response_result_code_pkey PRIMARY KEY (id);


--
-- Name: external_sync_opt_out_configuration external_sync_opt_out_configuration_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_sync_opt_out_configuration
    ADD CONSTRAINT external_sync_opt_out_configuration_pkey PRIMARY KEY (id);


--
-- Name: external_sync_opt_out_configuration external_sync_opt_out_configuration_system_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_sync_opt_out_configuration
    ADD CONSTRAINT external_sync_opt_out_configuration_system_id_key UNIQUE (system_id);


--
-- Name: external_system external_system_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_system
    ADD CONSTRAINT external_system_pkey PRIMARY KEY (id);


--
-- Name: filtered_contact filtered_contact_cell_campaign_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.filtered_contact
    ADD CONSTRAINT filtered_contact_cell_campaign_id_unique UNIQUE (cell, campaign_id);


--
-- Name: filtered_contact filtered_contact_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.filtered_contact
    ADD CONSTRAINT filtered_contact_pkey PRIMARY KEY (id);


--
-- Name: instance_setting instance_setting_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.instance_setting
    ADD CONSTRAINT instance_setting_pkey PRIMARY KEY (name);


--
-- Name: interaction_step interaction_step_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.interaction_step
    ADD CONSTRAINT interaction_step_pkey PRIMARY KEY (id);


--
-- Name: invite invite_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invite
    ADD CONSTRAINT invite_pkey PRIMARY KEY (id);


--
-- Name: job_request job_request_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.job_request
    ADD CONSTRAINT job_request_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations_lock knex_migrations_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_lock
    ADD CONSTRAINT knex_migrations_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations knex_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations
    ADD CONSTRAINT knex_migrations_pkey PRIMARY KEY (id);


--
-- Name: link_domain link_domain_domain_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.link_domain
    ADD CONSTRAINT link_domain_domain_unique UNIQUE (domain);


--
-- Name: link_domain link_domain_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.link_domain
    ADD CONSTRAINT link_domain_pkey PRIMARY KEY (id);


--
-- Name: log log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.log
    ADD CONSTRAINT log_pkey PRIMARY KEY (id);


--
-- Name: message message_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_pkey PRIMARY KEY (id);


--
-- Name: messaging_service messaging_service_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messaging_service
    ADD CONSTRAINT messaging_service_pkey PRIMARY KEY (messaging_service_sid);


--
-- Name: messaging_service_stick messaging_service_stick_cell_organization_unique_constraint; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messaging_service_stick
    ADD CONSTRAINT messaging_service_stick_cell_organization_unique_constraint UNIQUE (cell, organization_id);

ALTER TABLE ONLY public.messaging_service_stick REPLICA IDENTITY USING INDEX messaging_service_stick_cell_organization_unique_constraint;


--
-- Name: monthly_organization_message_usages monthly_organization_message_usages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.monthly_organization_message_usages
    ADD CONSTRAINT monthly_organization_message_usages_pkey PRIMARY KEY (organization_id, month);


--
-- Name: notification notification_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_pkey PRIMARY KEY (id);


--
-- Name: opt_out opt_out_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opt_out
    ADD CONSTRAINT opt_out_pkey PRIMARY KEY (id);


--
-- Name: organization organization_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization
    ADD CONSTRAINT organization_pkey PRIMARY KEY (id);


--
-- Name: password_reset_request password_reset_request_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_request
    ADD CONSTRAINT password_reset_request_pkey PRIMARY KEY (id);


--
-- Name: pending_message_part pending_message_part_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pending_message_part
    ADD CONSTRAINT pending_message_part_pkey PRIMARY KEY (id);


--
-- Name: all_question_response question_response_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.all_question_response
    ADD CONSTRAINT question_response_pkey PRIMARY KEY (id);


--
-- Name: all_tag tag_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.all_tag
    ADD CONSTRAINT tag_pkey PRIMARY KEY (id);


--
-- Name: all_tag tag_title_organization_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.all_tag
    ADD CONSTRAINT tag_title_organization_id_unique UNIQUE (title, organization_id);


--
-- Name: team_escalation_tags team_escalation_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_escalation_tags
    ADD CONSTRAINT team_escalation_tags_pkey PRIMARY KEY (id);


--
-- Name: team team_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team
    ADD CONSTRAINT team_pkey PRIMARY KEY (id);


--
-- Name: team team_title_organization_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team
    ADD CONSTRAINT team_title_organization_id_unique UNIQUE (title, organization_id);


--
-- Name: troll_alarm troll_alarm_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.troll_alarm
    ADD CONSTRAINT troll_alarm_pkey PRIMARY KEY (message_id);


--
-- Name: troll_trigger troll_trigger_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.troll_trigger
    ADD CONSTRAINT troll_trigger_pkey PRIMARY KEY (token, organization_id);


--
-- Name: unhealthy_link_domain unhealthy_link_domain_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.unhealthy_link_domain
    ADD CONSTRAINT unhealthy_link_domain_pkey PRIMARY KEY (id);


--
-- Name: opt_out unique_cell_per_organization_id; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opt_out
    ADD CONSTRAINT unique_cell_per_organization_id UNIQUE (cell, organization_id);


--
-- Name: canned_response unique_per_campaign; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.canned_response
    ADD CONSTRAINT unique_per_campaign UNIQUE (campaign_id, title);


--
-- Name: unsolicited_message unsolicited_message_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.unsolicited_message
    ADD CONSTRAINT unsolicited_message_pkey PRIMARY KEY (id);


--
-- Name: user_cell user_cell_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_cell
    ADD CONSTRAINT user_cell_pkey PRIMARY KEY (id);


--
-- Name: user_organization user_organization_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_organization
    ADD CONSTRAINT user_organization_pkey PRIMARY KEY (id);


--
-- Name: user_organization user_organization_user_id_organization_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_organization
    ADD CONSTRAINT user_organization_user_id_organization_id_unique UNIQUE (user_id, organization_id);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- Name: user_session user_session_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_session
    ADD CONSTRAINT user_session_pkey PRIMARY KEY (sid);


--
-- Name: user_team user_team_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_team
    ADD CONSTRAINT user_team_pkey PRIMARY KEY (id);


--
-- Name: user_team user_team_user_id_team_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_team
    ADD CONSTRAINT user_team_user_id_team_id_unique UNIQUE (user_id, team_id);


--
-- Name: zip_code zip_code_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.zip_code
    ADD CONSTRAINT zip_code_pkey PRIMARY KEY (zip);


--
-- Name: all_tag_deleted_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX all_tag_deleted_at_idx ON public.all_tag USING btree (((deleted_at IS NULL)));


--
-- Name: assignment_campaign_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX assignment_campaign_id_index ON public.assignment USING btree (campaign_id);


--
-- Name: assignment_request_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX assignment_request_status_index ON public.assignment_request USING btree (status);


--
-- Name: assignment_user_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX assignment_user_id_index ON public.assignment USING btree (user_id);


--
-- Name: campaign_contact_campaign_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX campaign_contact_campaign_id_index ON public.campaign_contact USING btree (campaign_id);


--
-- Name: campaign_contact_partial_assignment_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX campaign_contact_partial_assignment_id_index ON public.campaign_contact USING btree (assignment_id) WHERE (archived = false);


--
-- Name: campaign_contact_release_unhandled_replies_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX campaign_contact_release_unhandled_replies_idx ON public.campaign_contact USING btree (campaign_id, updated_at) WITH (fillfactor='70') WHERE ((message_status = 'needsResponse'::text) AND (assignment_id IS NOT NULL));


--
-- Name: campaign_contact_tag_contact_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX campaign_contact_tag_contact_idx ON public.campaign_contact_tag USING btree (campaign_contact_id);


--
-- Name: campaign_contact_tag_tag_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX campaign_contact_tag_tag_idx ON public.campaign_contact_tag USING btree (tag_id);


--
-- Name: campaign_contact_upload_campaign_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX campaign_contact_upload_campaign_id_index ON public.campaign_contact_upload USING btree (campaign_id);


--
-- Name: campaign_creator_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX campaign_creator_id_index ON public.all_campaign USING btree (creator_id);


--
-- Name: campaign_external_system_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX campaign_external_system_id_index ON public.all_campaign USING btree (external_system_id);


--
-- Name: campaign_limit_assignment_to_teams_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX campaign_limit_assignment_to_teams_index ON public.all_campaign USING btree (limit_assignment_to_teams);


--
-- Name: campaign_organization_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX campaign_organization_id_index ON public.all_campaign USING btree (organization_id);


--
-- Name: campaign_variable_unique_name_per_campaign; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX campaign_variable_unique_name_per_campaign ON public.campaign_variable USING btree (campaign_id, name) WHERE (deleted_at IS NULL);


--
-- Name: canned_response_campaign_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX canned_response_campaign_id_index ON public.canned_response USING btree (campaign_id);


--
-- Name: canned_response_user_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX canned_response_user_id_index ON public.canned_response USING btree (user_id);


--
-- Name: deliverability_report_computed_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX deliverability_report_computed_at_index ON public.deliverability_report USING btree (computed_at);


--
-- Name: deliverability_report_count_delivered_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX deliverability_report_count_delivered_index ON public.deliverability_report USING btree (count_delivered);


--
-- Name: deliverability_report_count_error_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX deliverability_report_count_error_index ON public.deliverability_report USING btree (count_error);


--
-- Name: deliverability_report_count_sent_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX deliverability_report_count_sent_index ON public.deliverability_report USING btree (count_sent);


--
-- Name: deliverability_report_count_total_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX deliverability_report_count_total_index ON public.deliverability_report USING btree (count_total);


--
-- Name: deliverability_report_domain_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX deliverability_report_domain_index ON public.deliverability_report USING btree (domain);


--
-- Name: deliverability_report_period_ends_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX deliverability_report_period_ends_at_index ON public.deliverability_report USING btree (period_ends_at);


--
-- Name: deliverability_report_period_starts_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX deliverability_report_period_starts_at_index ON public.deliverability_report USING btree (period_starts_at);


--
-- Name: deliverability_report_url_path_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX deliverability_report_url_path_index ON public.deliverability_report USING btree (url_path);


--
-- Name: filtered_contact_campaign_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX filtered_contact_campaign_id_index ON public.filtered_contact USING btree (campaign_id);


--
-- Name: interaction_step_campaign_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX interaction_step_campaign_id_index ON public.interaction_step USING btree (campaign_id);


--
-- Name: interaction_step_parent_interaction_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX interaction_step_parent_interaction_id_index ON public.interaction_step USING btree (parent_interaction_id);


--
-- Name: invite_is_valid_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX invite_is_valid_index ON public.invite USING btree (is_valid);


--
-- Name: job_request_queue_name_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX job_request_queue_name_index ON public.job_request USING btree (queue_name);


--
-- Name: link_domain_domain_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX link_domain_domain_index ON public.link_domain USING btree (domain);


--
-- Name: link_domain_organization_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX link_domain_organization_id_index ON public.link_domain USING btree (organization_id);


--
-- Name: message_assignment_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX message_assignment_id_index ON public.message USING btree (assignment_id);


--
-- Name: message_campaign_contact_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX message_campaign_contact_id_index ON public.message USING btree (campaign_contact_id);


--
-- Name: message_contact_number_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX message_contact_number_index ON public.message USING btree (contact_number);


--
-- Name: message_created_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX message_created_at_index ON public.message USING btree (created_at);


--
-- Name: message_send_status_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX message_send_status_index ON public.message USING btree (send_status);


--
-- Name: message_service_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX message_service_id_index ON public.message USING btree (service_id);


--
-- Name: message_user_number_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX message_user_number_index ON public.message USING btree (user_number);


--
-- Name: messaging_service_active_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX messaging_service_active_index ON public.messaging_service USING btree (active);


--
-- Name: messaging_service_default_for_organization_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX messaging_service_default_for_organization_index ON public.messaging_service USING btree (organization_id, is_default) WHERE is_default;


--
-- Name: messaging_service_organization_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX messaging_service_organization_id_index ON public.messaging_service USING btree (organization_id);


--
-- Name: messaging_service_service_type_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX messaging_service_service_type_index ON public.messaging_service USING btree (service_type);


--
-- Name: messaging_service_stick_cell_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX messaging_service_stick_cell_index ON public.messaging_service_stick USING btree (cell);


--
-- Name: messaging_service_stick_cell_organization_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX messaging_service_stick_cell_organization_index ON public.messaging_service_stick USING btree (cell, organization_id);


--
-- Name: messaging_service_stick_messaging_service_sid_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX messaging_service_stick_messaging_service_sid_index ON public.messaging_service_stick USING btree (messaging_service_sid);


--
-- Name: notification_notification_type_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX notification_notification_type_index ON public.notification USING btree (notification_type);


--
-- Name: notification_user_id_organization_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX notification_user_id_organization_id_index ON public.notification USING btree (user_id, organization_id);


--
-- Name: opt_out_assignment_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX opt_out_assignment_id_index ON public.opt_out USING btree (assignment_id);


--
-- Name: opt_out_cell_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX opt_out_cell_index ON public.opt_out USING btree (cell);


--
-- Name: opt_out_organization_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX opt_out_organization_id_index ON public.opt_out USING btree (organization_id);


--
-- Name: organization_deleted_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX organization_deleted_at_index ON public.organization USING btree (deleted_at);


--
-- Name: password_reset_request_token_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX password_reset_request_token_idx ON public.password_reset_request USING btree (token);


--
-- Name: pending_message_part_parent_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pending_message_part_parent_id_index ON public.pending_message_part USING btree (parent_id);


--
-- Name: pending_message_part_service_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pending_message_part_service_index ON public.pending_message_part USING btree (service);


--
-- Name: question_response_campaign_contact_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX question_response_campaign_contact_id_index ON public.all_question_response USING btree (campaign_contact_id);


--
-- Name: question_response_interaction_step_campaign_contact_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX question_response_interaction_step_campaign_contact_id_idx ON public.all_question_response USING btree (interaction_step_id, campaign_contact_id) WHERE (is_deleted = false);


--
-- Name: question_response_interaction_step_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX question_response_interaction_step_id_index ON public.all_question_response USING btree (interaction_step_id);


--
-- Name: question_response_is_deleted_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX question_response_is_deleted_index ON public.all_question_response USING btree (is_deleted);


--
-- Name: sync_config_qr_ac_ext_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sync_config_qr_ac_ext_idx ON public.external_sync_config_question_response_activist_code USING btree (external_activist_code_id);


--
-- Name: sync_config_qr_ac_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sync_config_qr_ac_idx ON public.external_sync_config_question_response_activist_code USING btree (question_response_config_id);


--
-- Name: sync_config_qr_rc_ext_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sync_config_qr_rc_ext_idx ON public.external_sync_config_question_response_result_code USING btree (external_result_code_id);


--
-- Name: sync_config_qr_rc_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sync_config_qr_rc_idx ON public.external_sync_config_question_response_result_code USING btree (question_response_config_id);


--
-- Name: sync_config_qr_ro_ext_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sync_config_qr_ro_ext_idx ON public.external_sync_config_question_response_response_option USING btree (external_response_option_id);


--
-- Name: sync_config_qr_ro_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sync_config_qr_ro_idx ON public.external_sync_config_question_response_response_option USING btree (question_response_config_id);


--
-- Name: tag_(lower(title))_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "tag_(lower(title))_index" ON public.all_tag USING btree (lower(title));


--
-- Name: tag_is_assignable_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX tag_is_assignable_index ON public.all_tag USING btree (is_assignable);


--
-- Name: team_escalation_tags_team_id_tag_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX team_escalation_tags_team_id_tag_id_index ON public.team_escalation_tags USING btree (team_id, tag_id);


--
-- Name: todos_partial_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX todos_partial_idx ON public.campaign_contact USING btree (campaign_id, assignment_id, message_status, is_opted_out) WHERE (archived = false);


--
-- Name: troll_alarm_dismissed_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX troll_alarm_dismissed_index ON public.troll_alarm USING btree (dismissed);


--
-- Name: troll_alarm_organization_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX troll_alarm_organization_id_index ON public.troll_alarm USING btree (organization_id);


--
-- Name: troll_alarm_trigger_token_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX troll_alarm_trigger_token_index ON public.troll_alarm USING btree (trigger_token);


--
-- Name: troll_trigger_organization_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX troll_trigger_organization_id_index ON public.troll_trigger USING btree (organization_id);


--
-- Name: unhealthy_link_domain_domain_created_at_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX unhealthy_link_domain_domain_created_at_index ON public.unhealthy_link_domain USING btree (domain, created_at);


--
-- Name: user_organization_organization_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX user_organization_organization_id_index ON public.user_organization USING btree (organization_id);


--
-- Name: user_organization_organization_id_user_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX user_organization_organization_id_user_id_index ON public.user_organization USING btree (organization_id, user_id);


--
-- Name: user_organization_user_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX user_organization_user_id_index ON public.user_organization USING btree (user_id);


--
-- Name: user_session_expire_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX user_session_expire_idx ON public.user_session USING btree (expire);


--
-- Name: assignment_request _500_assignment_request_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_assignment_request_updated_at BEFORE UPDATE ON public.assignment_request FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: assignment _500_assignment_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_assignment_updated_at BEFORE UPDATE ON public.assignment FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: user _500_backfill_superadmin_membership; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_backfill_superadmin_membership AFTER UPDATE ON public."user" FOR EACH ROW WHEN ((new.is_superadmin AND (new.is_superadmin IS DISTINCT FROM old.is_superadmin))) EXECUTE FUNCTION public.tg__user__backfill_superadmin_membership();


--
-- Name: campaign_contact_tag _500_campaign_contact_tag_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_campaign_contact_tag_updated_at BEFORE UPDATE ON public.campaign_contact_tag FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: campaign_contact _500_campaign_contact_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_campaign_contact_updated_at BEFORE UPDATE ON public.campaign_contact FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: campaign_contact_upload _500_campaign_contact_upload_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_campaign_contact_upload_updated_at BEFORE UPDATE ON public.campaign_contact_upload FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: all_campaign _500_campaign_external_system_id; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_campaign_external_system_id BEFORE INSERT OR UPDATE ON public.all_campaign FOR EACH ROW EXECUTE FUNCTION public.tg_campaign_check_exteral_system_id();


--
-- Name: campaign_team _500_campaign_team_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_campaign_team_updated_at BEFORE UPDATE ON public.campaign_team FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: all_campaign _500_campaign_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_campaign_updated_at BEFORE UPDATE ON public.all_campaign FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: campaign_variable _500_campaign_variable_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_campaign_variable_updated_at BEFORE UPDATE ON public.campaign_variable FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: canned_response _500_canned_response_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_canned_response_updated_at BEFORE UPDATE ON public.canned_response FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: all_campaign _500_cascade_archived_campaign; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_cascade_archived_campaign AFTER UPDATE ON public.all_campaign FOR EACH ROW WHEN ((new.is_archived IS DISTINCT FROM old.is_archived)) EXECUTE FUNCTION public.cascade_archived_to_campaign_contacts();


--
-- Name: external_activist_code _500_external_activist_code_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_external_activist_code_updated_at BEFORE UPDATE ON public.external_activist_code FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: external_list _500_external_list_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_external_list_updated_at BEFORE UPDATE ON public.external_list FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: external_result_code _500_external_result_code_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_external_result_code_updated_at BEFORE UPDATE ON public.external_result_code FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: external_survey_question_response_option _500_external_survey_question_response_option_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_external_survey_question_response_option_updated_at BEFORE UPDATE ON public.external_survey_question_response_option FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: external_survey_question _500_external_survey_question_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_external_survey_question_updated_at BEFORE UPDATE ON public.external_survey_question FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: external_sync_opt_out_configuration _500_external_sync_opt_out_configuration_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_external_sync_opt_out_configuration_updated_at BEFORE UPDATE ON public.external_sync_opt_out_configuration FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: all_external_sync_question_response_configuration _500_external_sync_question_response_configuration_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_external_sync_question_response_configuration_updated_at BEFORE UPDATE ON public.all_external_sync_question_response_configuration FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: external_system _500_external_system_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_external_system_updated_at BEFORE UPDATE ON public.external_system FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: log _500_handle_delivery_report; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_handle_delivery_report AFTER INSERT ON public.log FOR EACH ROW EXECUTE FUNCTION public.tg__log__handle_delivery_report();


--
-- Name: interaction_step _500_interaction_step_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_interaction_step_updated_at BEFORE UPDATE ON public.interaction_step FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: invite _500_invite_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_invite_updated_at BEFORE UPDATE ON public.invite FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: link_domain _500_link_domain_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_link_domain_updated_at BEFORE UPDATE ON public.link_domain FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: log _500_log_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_log_updated_at BEFORE UPDATE ON public.log FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: message _500_message_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_message_updated_at BEFORE UPDATE ON public.message FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: unsolicited_message _500_message_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_message_updated_at BEFORE UPDATE ON public.unsolicited_message FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: messaging_service_stick _500_messaging_service_stick_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_messaging_service_stick_updated_at BEFORE UPDATE ON public.messaging_service_stick FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: messaging_service _500_messaging_service_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_messaging_service_updated_at BEFORE UPDATE ON public.messaging_service FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: opt_out _500_opt_out_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_opt_out_updated_at BEFORE UPDATE ON public.opt_out FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: organization _500_organization_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_organization_updated_at BEFORE UPDATE ON public.organization FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: question_response _500_question_response_delete; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_question_response_delete INSTEAD OF DELETE ON public.question_response FOR EACH ROW EXECUTE FUNCTION public.question_response_instead_of_delete();


--
-- Name: all_question_response _500_question_response_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_question_response_insert BEFORE INSERT ON public.all_question_response FOR EACH ROW EXECUTE FUNCTION public.all_question_response_before_insert();


--
-- Name: all_question_response _500_question_response_update; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_question_response_update BEFORE UPDATE ON public.all_question_response FOR EACH ROW WHEN ((new.is_deleted = false)) EXECUTE FUNCTION public.all_question_response_before_update();


--
-- Name: tag _500_soft_delete_tag; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_soft_delete_tag INSTEAD OF DELETE ON public.tag FOR EACH ROW EXECUTE FUNCTION public.soft_delete_tag();


--
-- Name: all_tag _500_tag_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_tag_updated_at BEFORE UPDATE ON public.all_tag FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: team _500_team_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_team_updated_at BEFORE UPDATE ON public.team FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: unhealthy_link_domain _500_unhealthy_link_domain_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_unhealthy_link_domain_updated_at BEFORE UPDATE ON public.unhealthy_link_domain FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: campaign_group _500_universal_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_universal_updated_at BEFORE UPDATE ON public.campaign_group FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: campaign_group_campaign _500_universal_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_universal_updated_at BEFORE UPDATE ON public.campaign_group_campaign FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: user_organization _500_user_organization_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_user_organization_updated_at BEFORE UPDATE ON public.user_organization FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: user_team _500_user_team_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_user_team_updated_at BEFORE UPDATE ON public.user_team FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: user _500_user_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER _500_user_updated_at BEFORE UPDATE ON public."user" FOR EACH ROW EXECUTE FUNCTION public.universal_updated_at();


--
-- Name: all_campaign all_campaign_messaging_service_sid_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.all_campaign
    ADD CONSTRAINT all_campaign_messaging_service_sid_foreign FOREIGN KEY (messaging_service_sid) REFERENCES public.messaging_service(messaging_service_sid);


--
-- Name: all_external_sync_question_response_configuration all_external_sync_question_response_co_interaction_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.all_external_sync_question_response_configuration
    ADD CONSTRAINT all_external_sync_question_response_co_interaction_step_id_fkey FOREIGN KEY (interaction_step_id) REFERENCES public.interaction_step(id);


--
-- Name: all_external_sync_question_response_configuration all_external_sync_question_response_configurat_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.all_external_sync_question_response_configuration
    ADD CONSTRAINT all_external_sync_question_response_configurat_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.all_campaign(id);


--
-- Name: all_external_sync_question_response_configuration all_external_sync_question_response_configuratio_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.all_external_sync_question_response_configuration
    ADD CONSTRAINT all_external_sync_question_response_configuratio_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.external_system(id);


--
-- Name: assignment assignment_campaign_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assignment
    ADD CONSTRAINT assignment_campaign_id_foreign FOREIGN KEY (campaign_id) REFERENCES public.all_campaign(id);


--
-- Name: assignment assignment_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assignment
    ADD CONSTRAINT assignment_user_id_foreign FOREIGN KEY (user_id) REFERENCES public."user"(id);


--
-- Name: all_campaign campaign_autosend_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.all_campaign
    ADD CONSTRAINT campaign_autosend_user_id_fkey FOREIGN KEY (autosend_user_id) REFERENCES public."user"(id);


--
-- Name: campaign_contact campaign_contact_assignment_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_contact
    ADD CONSTRAINT campaign_contact_assignment_id_foreign FOREIGN KEY (assignment_id) REFERENCES public.assignment(id);


--
-- Name: campaign_contact campaign_contact_campaign_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_contact
    ADD CONSTRAINT campaign_contact_campaign_id_foreign FOREIGN KEY (campaign_id) REFERENCES public.all_campaign(id);


--
-- Name: campaign_contact_tag campaign_contact_tag_campaign_contact_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_contact_tag
    ADD CONSTRAINT campaign_contact_tag_campaign_contact_id_foreign FOREIGN KEY (campaign_contact_id) REFERENCES public.campaign_contact(id);


--
-- Name: campaign_contact_tag campaign_contact_tag_tag_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_contact_tag
    ADD CONSTRAINT campaign_contact_tag_tag_id_foreign FOREIGN KEY (tag_id) REFERENCES public.all_tag(id);


--
-- Name: campaign_contact_tag campaign_contact_tag_tagger_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_contact_tag
    ADD CONSTRAINT campaign_contact_tag_tagger_id_foreign FOREIGN KEY (tagger_id) REFERENCES public."user"(id);


--
-- Name: campaign_contact_upload campaign_contact_upload_campaign_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_contact_upload
    ADD CONSTRAINT campaign_contact_upload_campaign_id_foreign FOREIGN KEY (campaign_id) REFERENCES public.all_campaign(id);


--
-- Name: all_campaign campaign_creator_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.all_campaign
    ADD CONSTRAINT campaign_creator_id_foreign FOREIGN KEY (creator_id) REFERENCES public."user"(id);


--
-- Name: all_campaign campaign_external_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.all_campaign
    ADD CONSTRAINT campaign_external_system_id_fkey FOREIGN KEY (external_system_id) REFERENCES public.external_system(id);


--
-- Name: campaign_group_campaign campaign_group_campaign_campaign_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_group_campaign
    ADD CONSTRAINT campaign_group_campaign_campaign_group_id_fkey FOREIGN KEY (campaign_group_id) REFERENCES public.campaign_group(id);


--
-- Name: campaign_group_campaign campaign_group_campaign_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_group_campaign
    ADD CONSTRAINT campaign_group_campaign_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.all_campaign(id);


--
-- Name: campaign_group campaign_group_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_group
    ADD CONSTRAINT campaign_group_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);


--
-- Name: all_campaign campaign_organization_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.all_campaign
    ADD CONSTRAINT campaign_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organization(id);


--
-- Name: campaign_team campaign_team_campaign_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_team
    ADD CONSTRAINT campaign_team_campaign_id_foreign FOREIGN KEY (campaign_id) REFERENCES public.all_campaign(id) ON DELETE CASCADE;


--
-- Name: campaign_team campaign_team_team_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_team
    ADD CONSTRAINT campaign_team_team_id_foreign FOREIGN KEY (team_id) REFERENCES public.team(id) ON DELETE CASCADE;


--
-- Name: campaign_variable campaign_variable_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_variable
    ADD CONSTRAINT campaign_variable_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.all_campaign(id);


--
-- Name: canned_response canned_response_campaign_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.canned_response
    ADD CONSTRAINT canned_response_campaign_id_foreign FOREIGN KEY (campaign_id) REFERENCES public.all_campaign(id);


--
-- Name: canned_response canned_response_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.canned_response
    ADD CONSTRAINT canned_response_user_id_foreign FOREIGN KEY (user_id) REFERENCES public."user"(id);


--
-- Name: external_activist_code external_activist_code_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_activist_code
    ADD CONSTRAINT external_activist_code_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.external_system(id);


--
-- Name: external_result_code external_result_code_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_result_code
    ADD CONSTRAINT external_result_code_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.external_system(id);


--
-- Name: external_survey_question_response_option external_survey_question_respo_external_survey_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_survey_question_response_option
    ADD CONSTRAINT external_survey_question_respo_external_survey_question_id_fkey FOREIGN KEY (external_survey_question_id) REFERENCES public.external_survey_question(id) ON DELETE CASCADE;


--
-- Name: external_survey_question external_survey_question_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_survey_question
    ADD CONSTRAINT external_survey_question_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.external_system(id);


--
-- Name: external_sync_config_question_response_response_option external_sync_config_question__external_response_option_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_sync_config_question_response_response_option
    ADD CONSTRAINT external_sync_config_question__external_response_option_id_fkey FOREIGN KEY (external_response_option_id) REFERENCES public.external_survey_question_response_option(id) ON DELETE CASCADE;


--
-- Name: external_sync_config_question_response_result_code external_sync_config_question__question_response_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_sync_config_question_response_result_code
    ADD CONSTRAINT external_sync_config_question__question_response_config_id_fkey FOREIGN KEY (question_response_config_id) REFERENCES public.all_external_sync_question_response_configuration(id) ON DELETE CASCADE;


--
-- Name: external_sync_config_question_response_activist_code external_sync_config_question_question_response_config_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_sync_config_question_response_activist_code
    ADD CONSTRAINT external_sync_config_question_question_response_config_id_fkey1 FOREIGN KEY (question_response_config_id) REFERENCES public.all_external_sync_question_response_configuration(id) ON DELETE CASCADE;


--
-- Name: external_sync_config_question_response_response_option external_sync_config_question_question_response_config_id_fkey2; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_sync_config_question_response_response_option
    ADD CONSTRAINT external_sync_config_question_question_response_config_id_fkey2 FOREIGN KEY (question_response_config_id) REFERENCES public.all_external_sync_question_response_configuration(id) ON DELETE CASCADE;


--
-- Name: external_sync_config_question_response_activist_code external_sync_config_question_re_external_activist_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_sync_config_question_response_activist_code
    ADD CONSTRAINT external_sync_config_question_re_external_activist_code_id_fkey FOREIGN KEY (external_activist_code_id) REFERENCES public.external_activist_code(id) ON DELETE CASCADE;


--
-- Name: external_sync_config_question_response_result_code external_sync_config_question_resp_external_result_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_sync_config_question_response_result_code
    ADD CONSTRAINT external_sync_config_question_resp_external_result_code_id_fkey FOREIGN KEY (external_result_code_id) REFERENCES public.external_result_code(id) ON DELETE CASCADE;


--
-- Name: external_sync_opt_out_configuration external_sync_opt_out_configuratio_external_result_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_sync_opt_out_configuration
    ADD CONSTRAINT external_sync_opt_out_configuratio_external_result_code_id_fkey FOREIGN KEY (external_result_code_id) REFERENCES public.external_result_code(id);


--
-- Name: external_sync_opt_out_configuration external_sync_opt_out_configuration_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_sync_opt_out_configuration
    ADD CONSTRAINT external_sync_opt_out_configuration_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.external_system(id);


--
-- Name: filtered_contact filtered_contact_campaign_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.filtered_contact
    ADD CONSTRAINT filtered_contact_campaign_id_foreign FOREIGN KEY (campaign_id) REFERENCES public.all_campaign(id);


--
-- Name: interaction_step interaction_step_campaign_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.interaction_step
    ADD CONSTRAINT interaction_step_campaign_id_foreign FOREIGN KEY (campaign_id) REFERENCES public.all_campaign(id);


--
-- Name: interaction_step interaction_step_parent_interaction_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.interaction_step
    ADD CONSTRAINT interaction_step_parent_interaction_id_foreign FOREIGN KEY (parent_interaction_id) REFERENCES public.interaction_step(id) ON DELETE CASCADE;


--
-- Name: job_request job_request_campaign_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.job_request
    ADD CONSTRAINT job_request_campaign_id_foreign FOREIGN KEY (campaign_id) REFERENCES public.all_campaign(id);


--
-- Name: link_domain link_domain_organization_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.link_domain
    ADD CONSTRAINT link_domain_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organization(id);


--
-- Name: message message_campaign_contact_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_campaign_contact_id_foreign FOREIGN KEY (campaign_contact_id) REFERENCES public.campaign_contact(id);


--
-- Name: message message_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_user_id_foreign FOREIGN KEY (user_id) REFERENCES public."user"(id);


--
-- Name: monthly_organization_message_usages monthly_organization_message_usages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.monthly_organization_message_usages
    ADD CONSTRAINT monthly_organization_message_usages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);


--
-- Name: notification notification_campaign_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_campaign_id_foreign FOREIGN KEY (campaign_id) REFERENCES public.all_campaign(id);


--
-- Name: notification notification_organization_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organization(id);


--
-- Name: notification notification_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_user_id_foreign FOREIGN KEY (user_id) REFERENCES public."user"(id);


--
-- Name: opt_out opt_out_assignment_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opt_out
    ADD CONSTRAINT opt_out_assignment_id_foreign FOREIGN KEY (assignment_id) REFERENCES public.assignment(id);


--
-- Name: opt_out opt_out_organization_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opt_out
    ADD CONSTRAINT opt_out_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organization(id);


--
-- Name: organization organization_deleted_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization
    ADD CONSTRAINT organization_deleted_by_foreign FOREIGN KEY (deleted_by) REFERENCES public."user"(id);


--
-- Name: all_question_response question_response_campaign_contact_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.all_question_response
    ADD CONSTRAINT question_response_campaign_contact_id_foreign FOREIGN KEY (campaign_contact_id) REFERENCES public.campaign_contact(id);


--
-- Name: all_question_response question_response_interaction_step_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.all_question_response
    ADD CONSTRAINT question_response_interaction_step_id_foreign FOREIGN KEY (interaction_step_id) REFERENCES public.interaction_step(id);


--
-- Name: all_tag tag_author_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.all_tag
    ADD CONSTRAINT tag_author_id_foreign FOREIGN KEY (author_id) REFERENCES public."user"(id);


--
-- Name: all_tag tag_organization_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.all_tag
    ADD CONSTRAINT tag_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organization(id);


--
-- Name: team team_author_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team
    ADD CONSTRAINT team_author_id_foreign FOREIGN KEY (author_id) REFERENCES public."user"(id);


--
-- Name: team team_organization_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team
    ADD CONSTRAINT team_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organization(id);


--
-- Name: troll_alarm troll_alarm_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.troll_alarm
    ADD CONSTRAINT troll_alarm_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: troll_trigger troll_trigger_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.troll_trigger
    ADD CONSTRAINT troll_trigger_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: unsolicited_message unsolicited_message_messaging_service_sid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.unsolicited_message
    ADD CONSTRAINT unsolicited_message_messaging_service_sid_fkey FOREIGN KEY (messaging_service_sid) REFERENCES public.messaging_service(messaging_service_sid);


--
-- Name: user_cell user_cell_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_cell
    ADD CONSTRAINT user_cell_user_id_foreign FOREIGN KEY (user_id) REFERENCES public."user"(id);


--
-- Name: user_organization user_organization_organization_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_organization
    ADD CONSTRAINT user_organization_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organization(id);


--
-- Name: user_organization user_organization_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_organization
    ADD CONSTRAINT user_organization_user_id_foreign FOREIGN KEY (user_id) REFERENCES public."user"(id);


--
-- Name: user_team user_team_team_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_team
    ADD CONSTRAINT user_team_team_id_foreign FOREIGN KEY (team_id) REFERENCES public.team(id) ON DELETE CASCADE;


--
-- Name: user_team user_team_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_team
    ADD CONSTRAINT user_team_user_id_foreign FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

