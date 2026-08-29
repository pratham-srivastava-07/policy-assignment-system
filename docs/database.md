we will have tables in our database. those tables are defined in here:

employee:

id
name
email
dept
state
hire_date
groups
employement_type
role
created_at
updated_at

organization table:

id
emp.org_id -> org.id


policy_rules table:

id
organization_id
policy_id
name
rule_type
priority
conditions
enabled
effective_from
effective_to
version
created_at
updated_at

policy_categories

id
organization_id
name
key
cardinality

assignments table:

id
organization_id
employee_id
policy_id

source_rule_id
source_rule_version

effective_from
effective_to

resolution_status
resolution_reason

created_at
updated_at

groups table:

id 
org_id
name
description
created_at
updated_at

employee_groups

emp_id
group_id
effictive_from
effective_to
created_at

PRIMARY KEY (employee_id, group_id)

policies table:

id
org_id
category_id
name
description
status
created_at
updated_at

policy_rules table:

id
organization_id
policy_id
name
rule_type
priority
conditions
enabled
effective_from
effective_to
version
created_at
updated_at

assignment_resolution_events table:

id
organization_id
employee_id
assignment_id
rule_id
rule_version
policy_id
category_id

decision
reason

evaluated_at
created_at

audit_events table:

id
organization_id
actor_id
action
entity_type
entity_id
before_state      JSONB
after_state       JSONB
metadata          JSONB
created_at

employee_attribute_history table:

id
employee_id
attribute
old_value
new_value
effective_from
effective_to
changed_by
created_at

sessions table
--------
id
user_id
organization_id
token_hash
expires_at
revoked_at
created_at
last_seen_at

organization_memberships
------------------------
id
user_id
organization_id
role
created_at
updated_at

users
-----
id
email
name
created_at
updated_at

outbox_events
-------------
id
organization_id
event_type
aggregate_type
aggregate_id
payload             JSONB
status
attempts
available_at
processed_at
created_at

policy_rule_versions
--------------------
id                  UUID PK
rule_id             UUID FK
version             INTEGER
rule_type           VARCHAR
priority            INTEGER
conditions          JSONB
enabled             BOOLEAN
effective_from      TIMESTAMP
effective_to        TIMESTAMP
created_by          UUID
created_at          TIMESTAMP