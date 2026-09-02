#!/usr/bin/env node
import { NodeRuntime, NodeServices } from '@effect/platform-node'
import { Effect } from 'effect'
import { Command } from 'effect/unstable/cli'

import { version } from '../../package.json' with { type: 'json' }
import { hekireki } from '../cli/index.js'

NodeRuntime.runMain(Command.run(hekireki, { version }).pipe(Effect.provide(NodeServices.layer)))
