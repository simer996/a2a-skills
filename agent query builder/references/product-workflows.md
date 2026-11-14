# Product research starting map

Public sources consulted 2026-11-10. Refresh per run, especially release-specific
schemas, licensing, regional coverage and branding. No source establishes what a
particular tenant or custom agent implements.

## Workday

HCM covers worker/organization data; Recruiting covers requisitions, applications,
screening, interview events, feedback and offers. Payroll covers calculation
results, earnings/deductions, retro adjustments, input batches and pre-close
reconciliation. Offer extension, payroll release and bank changes are different
actions from reviewing readiness.

Global payroll can use integrated partner processing; a country's presence in a
dataset does not prove a native Workday payroll engine. Confirm country/provider
and data lineage. Candidate funnel totals cannot identify qualified individuals.

- Global payroll and partner integration, full page verified:
  https://www.workday.com/en-us/products/payroll/global-payroll.html
- Recruiting/talent acquisition datasheet, indexed official evidence:
  https://www1.workday.com/content/dam/web/en-us/documents/datasheets/datasheet-workday-recruiting.pdf
- Payroll Agent capabilities and setup, indexed official documentation:
  https://doc.workday.com/admin-guide/en-us/workday-ai/agents/workday-built-agents/payroll-agent/concept--payroll-agent.html
  https://doc.workday.com/admin-guide/en-us/workday-ai/agents/workday-built-agents/payroll-agent/set-up-payroll-agent.html

The built-in Payroll Agent is a comparison example, not evidence that a supplied
custom agent exposes its skills. Setup and tool permissions affect availability.

## ServiceNow

ITSM incidents have impact, urgency, priority, affected services/CIs, assignment
groups, work notes and escalation. Catalog requests, requested items and
fulfillment tasks are distinct from incidents. Lifecycle Events may coordinate
HR, IT and Facilities activities; the IT agent need not own HR activation,
identity provisioning, workplace approval or supplier procurement.

Use the configured priority lookup table, not a hard-coded universal matrix.
Vendor sample lookup tables are defaults; numerical and prose urgency can disagree.
Reporting a recommendation is not changing an incident's assignment or priority.

- Lifecycle stages/activity ownership, indexed official evidence; direct fetch
  returns a JS shell:
  https://www.servicenow.com/docs/r/employee-service-management/lifecycle-events/define-lifecycle-event-process.html
- Activity sets, tasks, approvals and notifications, indexed official evidence:
  https://www.servicenow.com/docs/r/employee-service-management/lifecycle-events/configure-hr-lifecycle-event-type.html
- Configurable priority lookup, indexed official evidence:
  https://www.servicenow.com/docs/r/de-DE/it-service-management/incident-management/def-prio-lookup-rules.html
- Official AI agent workflow examples, indexed evidence; do not assume installed:
  https://www.servicenow.com/docs/r/it-service-management/agents-ai-native-it-service-desk.html

## Salesforce

Customer 360 is a portfolio/architecture umbrella, not a single object or a
guarantee of a Data Cloud/Data 360 deployment. Distinguish Sales accounts,
contacts/opportunities; Service cases, entitlements, milestones and Knowledge;
unified profile/identity resolution; consent; loyalty and commerce context.
Custom unified-profile keys are not necessarily Salesforce record IDs.

Profile/account handoff and case-response drafting have different owners.
Consent is per relevant person/channel/context; household membership is not
permission to merge profiles or activate marketing. Linked ERP exposure is not
interchangeable with pipeline value and must not be double counted.

- Product boundaries, full page verified:
  https://trailhead.salesforce.com/content/learn/modules/the-salesforce-agentic-enterprise-architecture/explore-the-customer-360-business-logic
- Official Agentforce examples, full page verified, including identity checking,
  order lookup, grounding, record creation and multi-turn sequencing:
  https://developer.salesforce.com/docs/ai/agentforce/guide/agent-examples.html

These are implementation patterns, not capabilities inherited by a custom card.
Retrieve actual tenant Knowledge/policy evidence before asserting a policy.

## Coupa

Separate requisition approval, PO preparation/change/issuance/transmission/
acknowledgment/receipt; invoice capture/matching/exception/approval; payment
execution; and supplier information/qualification/onboarding.

Invoice match can depend on acceptance or goods receipt even within amount
tolerance. Tolerance formulas (greater/lesser, absolute/percentage, per-line/
header) are tenant-specific. Duplicate alerts are not adjudicated fraud.
PO issuance APIs may transmit to suppliers; "prepare issuance" need not write.
Supplier SIM attestations and lifecycle status do not authorize banking changes.

Official API evidence was available through indexed search; direct requests can
redirect to a browser-compatibility page. Do not represent snippets as full review.

- https://docs.coupa.com/en/developer-documentation/the-coupa-core-api/resources/transactional-resources/purchase-orders-api-purchase_orders
- https://docs.coupa.com/en/developer-documentation/the-coupa-core-api/resources/transactional-resources/invoices-api-invoices
- https://docs.coupa.com/en/developer-documentation/the-coupa-core-api/resources/reference-data-resources/supplier-information-api-supplier_information
- General developer reference and integrations:
  https://docs.coupa.com/en/developer-documentation

An API is not an autonomous-agent implementation. No reviewed public Coupa agent
example is bundled as a validated equivalent; research one when the task needs it.

## SAP

SAP Ariba Supplier Risk monitors risk exposure, alerts and engagement assessments.
Supplier Lifecycle and Performance qualification/onboarding, supplier master
approval and S/4HANA purchasing are related but separate.

Financial close may use S/4HANA closing cockpit or Advanced Financial Closing;
confirm the installed product. Review task lists, company code, fiscal period,
owners, dependencies and evidence for GR/IR, bank, accrual, tax and other close
activities. Close-task readiness is not journal posting or period locking.
Do not infer a complete dependency graph from a short readiness narrative.

- Supplier Risk guide, indexed official evidence; direct fetch is a JS shell:
  https://help.sap.com/docs/strategic-sourcing/monitoring-supplier-risk/monitoring-supplier-risk
- Closing advisor developer workflow, full page verified:
  https://developers.sap.com/tutorials/financial-closing-advisor-agent/
- Supplier-monitoring developer workflow, indexed official evidence:
  https://developers.sap.com/tutorials/joule-studio-spend-supplier-assistant/

The Joule Studio examples are educational/pre-release Agent Lab patterns, not
proof of production availability or the supplied agent's privileges.

## A2A protocol

Use the version declared by each interface; do not conflate an application's
semver with the protocol version. Check normative definitions, not an outdated
local rubric alone.

- Version-pinned 1.0 specification, full page verified:
  https://a2a-protocol.org/v1.0.0/specification/
- Legacy 0.3 specification:
  https://a2a-protocol.org/v0.3.0/specification/
- Normative source and release history:
  https://github.com/a2aproject/A2A
  https://github.com/a2aproject/A2A/releases

Use these definitions only to read card fields (skills, descriptions, examples)
as scope input. Cards describe advertised scope; they cannot prove reachability,
authentication enforcement, authorization, runtime skill support or real answer
correctness.
