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

### [Getting Started](/docs/gdk/hello-world)

Build a small Rust agent that can run shell commands, stream responses, and
save its conversation between runs. The walkthrough explains how to connect a
provider, tools, and a state machine, and which parts your application owns.
Start here to see the pieces working together before choosing how to adapt them.

### [Demos](/docs/gdk/demos)

Explore working projects that use GDK for browser applications, phone calls,
screen understanding, and custom interfaces to goose. Each demo links to its
source and explains the architectural idea behind it, along with what you need
to run it. Use them to see how the same components fit very different applications.

### [Concepts](/docs/gdk/concepts)

Understand the state machine, operations, providers, and authentication, and how
they fit together. These guides explain the problems each component solves,
the choices behind its design, and the implementations available today. Worked
examples show how to compose agent behavior and when to write your own
operation or provider.

### [Reference](/docs/gdk/reference)

Find the GDK crates, what each one provides, and links to their generated Rust
API documentation. The reference also points to the shared provider bindings
for Python and Kotlin and the ACP protocol used to connect to goose. Use it
when you need exact types, methods, and configuration details while building.

## GDK and goose

goose is a complete agent application and the main reference implementation for
GDK. Use goose when you want a ready-to-run agent. Use GDK when you want to build
agent behavior into your own product.

The pre-built goose binary can also serve as the agent behind any
[ACP application](/docs/gdk/acp) you build. goose Desktop works this way,
connecting to a local goose server over ACP.
