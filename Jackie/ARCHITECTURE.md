# Jackie Architecture

## High-level design goal

Jackie should be built as a modular, local-first, cloud-portable assistant framework.

The system should be easy to understand, easy to extend, and resistant to technical debt.

## Core modules

### 1. Core assistant engine
Responsible for:
- handling incoming messages
- orchestrating memory, retrieval, model calls, and responses
- maintaining overall assistant behavior

### 2. Config module
Responsible for:
- environment configuration
- runtime settings
- feature toggles
- behavior defaults

### 3. Memory module
Responsible for:
- storing active memory records
- retrieving relevant memory
- applying memory tiers
- pruning ephemeral content
- protecting gold memory

### 4. Retrieval module
Responsible for:
- searching active memory
- searching knowledge vault files
- ranking useful context
- assembling context for response generation

### 5. Security module
Responsible for:
- scanning code and text for risk
- identifying secrets and insecure patterns
- surfacing warnings cleanly

### 6. Dispatcher module
Responsible for:
- mapping commands to handlers
- keeping command behavior modular
- avoiding giant fragile condition chains

### 7. Model provider module
Responsible for:
- abstracting the LLM backend
- allowing provider changes without rewriting the core
- supporting local or cloud models later

### 8. Integration layer
Responsible for:
- Telegram
- Gmail
- Google Sheets
- Google Calendar
- future services

## Preferred design principles

- clear separation of concerns
- async-first where useful
- pluggable backends
- structured logging
- readable code over clever code
- graceful fallback behavior
- secure defaults

## Storage philosophy

Early phase:
- SQLite for active memory
- local folder for knowledge vault
- optional iCloud sync for the folder

Later phase:
- cloud database if scale requires it
- secondary provider support
- server or mini-computer runtime for 24/7 availability

## Operational philosophy

Start small and stable.

Recommended order:
1. CLI assistant
2. SQLite memory
3. Telegram interface
4. security upgrades
5. retrieval improvements
6. Google integrations
7. model abstraction
8. background runtime
9. cloud portability

## Anti-chaos rule

Do not build everything at once.
Build in layers.
Protect maintainability from the beginning.
