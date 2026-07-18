-- Epic is a grouping resource, not a ticket type. Normalize the legacy built-in
-- ticket type names while leaving all other custom ticket types untouched.
update tickets
set issue_type = case lower(trim(issue_type))
  when 'epic' then 'Task'
  when 'feature / user story' then 'Story'
  when 'engineering task' then 'Task'
  when 'software defect / bug' then 'Bug'
  when 'child sub-task' then 'Sub-task'
  when 'subtask' then 'Sub-task'
  else issue_type
end
where lower(trim(issue_type)) in (
  'epic',
  'feature / user story',
  'engineering task',
  'software defect / bug',
  'child sub-task',
  'subtask'
);

update tickets
set epic = ''
where lower(trim(epic)) = 'product backlog';

delete from workspace_resources
where kind = 'issue-type'
  and lower(trim(name)) = 'epic';

delete from workspace_resources legacy
using workspace_resources canonical
where legacy.kind = 'issue-type'
  and canonical.kind = 'issue-type'
  and legacy.organization = canonical.organization
  and legacy.project is not distinct from canonical.project
  and lower(trim(legacy.name)) in (
    'feature / user story',
    'engineering task',
    'software defect / bug',
    'child sub-task',
    'subtask'
  )
  and lower(trim(canonical.name)) = case lower(trim(legacy.name))
    when 'feature / user story' then 'story'
    when 'engineering task' then 'task'
    when 'software defect / bug' then 'bug'
    when 'child sub-task' then 'sub-task'
    when 'subtask' then 'sub-task'
  end
  and legacy.id <> canonical.id;

with mapped_aliases as (
  select
    id,
    row_number() over (
      partition by organization, project, case lower(trim(name))
        when 'feature / user story' then 'story'
        when 'engineering task' then 'task'
        when 'software defect / bug' then 'bug'
        when 'child sub-task' then 'sub-task'
        when 'subtask' then 'sub-task'
      end
      order by created_at, id
    ) as alias_rank
  from workspace_resources
  where kind = 'issue-type'
    and lower(trim(name)) in (
      'feature / user story',
      'engineering task',
      'software defect / bug',
      'child sub-task',
      'subtask'
    )
)
delete from workspace_resources
where id in (
  select id
  from mapped_aliases
  where alias_rank > 1
);

update workspace_resources
set name = case lower(trim(name))
  when 'feature / user story' then 'Story'
  when 'engineering task' then 'Task'
  when 'software defect / bug' then 'Bug'
  when 'child sub-task' then 'Sub-task'
  when 'subtask' then 'Sub-task'
  else name
end
where kind = 'issue-type'
  and lower(trim(name)) in (
    'feature / user story',
    'engineering task',
    'software defect / bug',
    'child sub-task',
    'subtask'
  );
