#!/usr/bin/env node
import { runMain } from '@effect/platform-node/NodeRuntime'
import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Effect } from 'effect'

import { hekireki } from '../cli/index.js'

runMain(hekireki().pipe(Effect.provide(nodeServicesLayer)))
