#!/usr/bin/env node
import { NodeRuntime, NodeServices } from '@effect/platform-node'
import { Effect } from 'effect'

import { hekireki } from '../cli/index.js'

NodeRuntime.runMain(hekireki(process.argv.slice(2)).pipe(Effect.provide(NodeServices.layer)))
