#!/usr/bin/env node
import { NodeRuntime, NodeServices } from '@effect/platform-node'
import { Effect } from 'effect'

import { version } from '../../package.json' with { type: 'json' }
import { hekireki } from '../cli/index.js'

NodeRuntime.runMain(hekireki({ version }).pipe(Effect.provide(NodeServices.layer)))
