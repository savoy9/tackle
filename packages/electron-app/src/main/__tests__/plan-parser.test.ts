import { describe, it, expect } from 'vitest';
import { PlanParser } from '../plan-parser';

describe('PlanParser', () => {
  it('extracts phases from "### Phase N:" heading pattern', () => {
    const markdown = `
# Implementation Plan

> **Status:** Draft

## Implementation Phases

### Phase 0: Azure Self-Hosting

**Goal:** Get Dagster running on Azure.

| Step | Description | Artifact |
|------|-------------|----------|
| 0.1  | Validate Bicep | Done |

### Phase 1: Auth Middleware

**Goal:** Build the auth layer.

| Step | Description | Artifact |
|------|-------------|----------|
| 1.1  | Add middleware | auth.ts |
| 1.2  | Add token refresh | refresh.ts |

### Phase 2: Error Handling

**Goal:** Graceful error handling.
`;

    const phases = PlanParser.extractPhases(markdown);

    expect(phases).toHaveLength(3);
    expect(phases[0].name).toBe('Azure Self-Hosting');
    expect(phases[0].sort_order).toBe(0);
    expect(phases[1].name).toBe('Auth Middleware');
    expect(phases[1].sort_order).toBe(1);
    expect(phases[2].name).toBe('Error Handling');
    expect(phases[2].sort_order).toBe(2);
  });

  it('extracts phases from "## Slice N:" heading pattern', () => {
    const markdown = `
# Session Pool Plan

## Slice 1: Pool Table + Schema

**PRD sections**: 6a

### What to build
Create the pool table.

### Acceptance criteria
- [ ] Table exists

## Slice 2: Connection Manager

**PRD sections**: 6b

### What to build
Manage connections.

## Slice 3: Health Checks

### What to build
Check health.
`;

    const phases = PlanParser.extractPhases(markdown);

    expect(phases).toHaveLength(3);
    expect(phases[0].name).toBe('Pool Table + Schema');
    expect(phases[1].name).toBe('Connection Manager');
    expect(phases[2].name).toBe('Health Checks');
  });

  it('captures phase description from content until next heading', () => {
    const markdown = `
### Phase 1: Build the thing

**Goal:** Make it work.

Some details about this phase.

### Phase 2: Test the thing

**Goal:** Verify it works.
`;

    const phases = PlanParser.extractPhases(markdown);

    expect(phases[0].description).toContain('Make it work');
    expect(phases[0].description).toContain('Some details');
    expect(phases[0].description).not.toContain('Verify it works');
  });

  it('returns empty array when no phases are found', () => {
    const markdown = `
# Just a document

Some content without any phase structure.

## A section
More content.
`;

    const phases = PlanParser.extractPhases(markdown);
    expect(phases).toHaveLength(0);
  });

  it('handles "## Phase N:" pattern (H2 instead of H3)', () => {
    const markdown = `
# Plan

## Phase 1: First thing

Details.

## Phase 2: Second thing

More details.
`;

    const phases = PlanParser.extractPhases(markdown);
    expect(phases).toHaveLength(2);
    expect(phases[0].name).toBe('First thing');
    expect(phases[1].name).toBe('Second thing');
  });

  it('handles phases with sub-identifiers like "Phase 1a"', () => {
    const markdown = `
### Phase 1a: Setup

Content.

### Phase 1b: Config

Content.

### Phase 2: Build

Content.
`;

    const phases = PlanParser.extractPhases(markdown);
    expect(phases).toHaveLength(3);
    expect(phases[0].name).toBe('Setup');
    expect(phases[1].name).toBe('Config');
    expect(phases[2].name).toBe('Build');
  });
});
