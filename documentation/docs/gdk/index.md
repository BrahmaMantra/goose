---
title: GDK
displayed_sidebar: gdkSidebar
hide_table_of_contents: true
description: Build agents with GDK.
---

# GDK

Build agents that run across native applications, servers, and the browser,
resume from persisted state, and give you control over how they work.

GDK is the set of reusable agent-runtime components used to build goose. It
provides model integrations, a composable state machine, tools, context
management, and the interfaces needed to run an agent inside your application.

## Explore GDK

### [Hello World](/docs/gdk/hello-world)

Build a working agent and see how its pieces fit together.

### [Demos](/docs/gdk/demos)

See GDK running in applications beyond the usual coding-agent interface.

### [Concepts](/docs/gdk/concepts)

Understand the state machine, operations, providers, and authentication, and how
to compose them into your own agent.

### [Reference](/docs/gdk/reference)

Find the GDK crates and their generated API documentation for Rust, Python, and
Kotlin.

## GDK and goose

goose is a complete agent application and the main reference implementation for
GDK. Use goose when you want a ready-to-run agent. Use GDK when you want to build
agent behavior into your own product.

The pre-built goose binary can also serve as the agent behind any
[ACP application](/docs/gdk/acp) you build. goose Desktop works this way,
connecting to a local goose server over ACP.
