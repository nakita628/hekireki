// Migrate は Studio に出さない。ページも API もそのまま残してあるので、戻すときはこのファイルと
// features/sidebar/sidebar.tsx のコメントを外し、routeTree.gen.ts を作り直す。
//
// import { createFileRoute } from '@tanstack/react-router'
//
// import { MigrateView } from '../features/migrate/migrate-view.js'
//
// export const Route = createFileRoute('/migrate')({ component: MigrateView })
