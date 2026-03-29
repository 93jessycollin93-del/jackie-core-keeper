# Jackie Memory Model

## Memory philosophy

Jackie should not remember everything equally.

Memory must be tiered so that noise does not overwhelm value.

## Memory tiers

### 1. Ephemeral Memory

Purpose:
Short-term conversational context and disposable clutter.

Examples:
- casual chatter
- temporary phrasing ideas
- one-off requests
- low-value fragments

Behavior:
- retained briefly
- automatically pruned
- not treated as part of identity

### 2. Durable Memory

Purpose:
Important recurring facts, project context, preferences, workflows, and meaningful decisions.

Examples:
- preferred tools
- project architecture direction
- recurring integration plans
- coding style preferences
- routine habits and workflows

Behavior:
- retained long-term
- searchable
- used in future reasoning
- occasionally condensed or summarized

### 3. Gold Memory

Purpose:
Critical identity-level information and major decisions that should not be lost.

Examples:
- Jackie's core identity
- essential user preferences
- foundational project goals
- major life-shaping or project-shaping decisions
- non-negotiable safety or design rules

Behavior:
- preserved indefinitely unless explicitly removed
- never auto-pruned
- treated as foundational context

## Knowledge vault vs active memory

Jackie's folder is not active memory by itself.
It is a knowledge vault.

The system should eventually convert useful files into active, structured memory records inside a memory database.

## Desired future flow

1. chats and notes are saved in the folder
2. Jackie ingests them
3. useful information is classified into memory tiers
4. active memory records are stored in a searchable database
5. retrieval uses both memory and vault documents when needed

## Guiding principle

Auto-prune junk.
Preserve gold.
Keep the surface area low.
Keep the meaningful structure strong.
