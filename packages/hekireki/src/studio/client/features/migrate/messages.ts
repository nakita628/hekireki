import { defineMessages } from './language.js'

/** What a check or a suggestion is about, as the server read it from the schema and the database. */
type Facts = Readonly<Record<string, string>>

function rows(n: number) {
  return n === 1 ? '1 row' : `${n} rows`
}

function values(n: number) {
  return n === 1 ? '1 value' : `${n} values`
}

/** The words of the page itself. */
export const PAGE = defineMessages({
  en: {
    title: 'Migrate',
    toJapanese: '日本語で表示 (Show in Japanese)',
    toEnglish: 'Show in English',
    reason: 'Why',
    failureHint:
      'Nothing after the failure has run. Put right what the message names, then try again; if a step had run, compare again first.',
    dismiss: 'Dismiss',
    stepFailedAt: (n: number) => `Step ${n} did not go through.`,
    drift: 'The database differs from the schema',
    inStep: 'In step with the schema',
    loading: 'Reading the migration history…',
    unreadable: 'The migration history could not be read.',
    historyTitle: 'History',
    historyDescription:
      'What the database has recorded, against what the migrations directory holds.',
    deploy: (n: number) => `Deploy ${n} pending`,
    deployNote: 'Runs each pending migration whole, as `prisma migrate deploy` does.',
    diverged: (what: string) => `${what} Resolve that before migrating further.`,
    fullSql: 'The whole migration.sql',
    fullSqlNote:
      'What is written to the migrations directory and run: the statements that change rows first, then the schema changes with what the decisions write into them.',
    upToDate: 'The database already matches the schema: there is nothing to migrate.',
    changesTitle: 'What the schema changes',
    changesDescription: 'Read from the schema and the database; nothing has run yet.',
    planning: 'Comparing the schema with the database…',
    planAgain: 'Compare again',
    noSchemaChanges: 'No change to the tables themselves.',
    cautions: 'What else happens to the data',
    decideTitle: 'What becomes of the data',
    decideDescription:
      'Some rows do not fit the new schema. Say what becomes of each; a suggestion read from the schema is selected for you.',
    nothingToDecide: 'Every row fits the new schema: there is nothing to decide.',
    toDecide: (left: number, total: number) =>
      left === 0 ? `All ${total} decided` : `${left} of ${total} still to decide`,
    takeAll: 'Use every suggestion',
    keptIn: 'Kept in',
    reviewTitle: 'Check the result',
    reviewDescription:
      'The rows as the decisions leave them, read from the database as it is now. Nothing changes by looking.',
    nothingToPreview: 'No rows are changed before the schema changes.',
    losesData: (n: number) =>
      n === 1 ? '1 step drops data or rows.' : `${n} steps drop data or rows.`,
    runTitle: 'Run the migration',
    runDescription:
      'Runs every step in order, then writes migration.sql and records it as applied, so Prisma Migrate owns it from here on.',
    name: 'Migration name',
    batch: 'Rows at a time',
    batchHint:
      'A fix over more rows runs in batches of this many, each holding its locks for its own rows only. Empty: every fix in one statement.',
    runAll: 'Run and record',
    running: (done: number, total: number) => `Running step ${done} of ${total}…`,
    blocked: 'Decide what becomes of the data first.',
    stale:
      'A step did not go through, and what ran before it stays run. Compare again: the new plan starts from the database as it is now.',
    oneByOne: 'Run one step at a time',
    record: 'Record as applied',
    recordNote: 'Every step has run; write migration.sql and record it.',
    recordFirst: 'Run every step before recording it.',
    confirmTitle: 'Run steps that lose data?',
    confirmNote:
      'The database cannot undo this by itself: what is lost comes back only from a backup.',
    rehearseTitle: 'Rehearse it',
    rehearseDescription:
      'The migration run for real where nothing is kept, to see that every step goes through and what the tables hold after.',
    rehearseFailed: 'The migration could not be rehearsed.',
    backupFailed: 'The backup could not be taken, so nothing was run.',
    restoreFailed: 'The backup could not be restored.',
    rehearseFirst: 'Rehearse the migration first: it loses data.',
    rehearsalFailedBlock: 'The rehearsal did not go through: the run would stop at the same step.',
    noBackup: 'No backup is taken: what is lost cannot be had back from Studio.',
    confirmRun: 'Run',
    planFailed: 'The migration could not be planned.',
    stepFailed: 'The step could not be run.',
    writeFailed: 'The migration could not be written.',
    recordFailed: 'The migration could not be recorded.',
    keepFailed: 'The decision could not be kept.',
    deployFailed: 'The migrations could not be applied.',
    baselineFailed: 'The database could not be baselined.',
    recorded: (name: string) => `Recorded ${name} as applied`,
    rolledBack: 'Recorded as rolled back',
    applied: (names: readonly string[]) =>
      names.length === 1 ? `Applied ${names[0] ?? ''}` : `Applied ${names.length} migrations`,
  },
  ja: {
    title: 'マイグレーション',
    toJapanese: '日本語で表示',
    toEnglish: '英語で表示 (Show in English)',
    reason: '理由',
    failureHint:
      '失敗した処理より後は実行されていません。メッセージが示す原因を直してから、もう一度実行してください。途中までステップを実行していた場合は、先に「もう一度比べる」を押してください。',
    dismiss: '閉じる',
    stepFailedAt: (n: number) => `ステップ ${n} を実行できませんでした。`,
    drift: 'データベースがスキーマと異なります',
    inStep: 'スキーマと一致しています',
    loading: 'マイグレーション履歴を読み込んでいます…',
    unreadable: 'マイグレーション履歴を読み込めませんでした。',
    historyTitle: '履歴',
    historyDescription:
      'データベースに記録されたものと、migrations ディレクトリにあるものの対比です。',
    deploy: (n: number) => `未適用の ${n} 件を適用`,
    deployNote:
      '`prisma migrate deploy` と同じく、未適用のマイグレーションを1件ずつ丸ごと実行します。',
    diverged: (what: string) => `${what}先にこれを解消してください。`,
    fullSql: 'migration.sql の全体',
    fullSqlNote:
      'migrations フォルダに書き出され、実行される SQL です。行を書き換える文が先に来て、そのあとに、決定の内容を書き込んだスキーマ変更の文が続きます。',
    upToDate: 'データベースはスキーマと一致しています。マイグレーションは不要です。',
    changesTitle: 'スキーマの変更内容',
    changesDescription: 'スキーマとデータベースを比べた結果です。まだ何も実行していません。',
    planning: 'スキーマとデータベースを比べています…',
    planAgain: 'もう一度比べる',
    noSchemaChanges: 'テーブルの構造そのものは変わりません。',
    cautions: 'データに起きるその他のこと',
    decideTitle: 'データの扱いを決める',
    decideDescription:
      '新しいスキーマに合わない行があります。それぞれどう扱うかを決めてください。スキーマから推測した推奨を選択済みにしています。',
    nothingToDecide: 'すべての行が新しいスキーマに合っています。決めることはありません。',
    toDecide: (left: number, total: number) =>
      left === 0 ? `${total} 件すべて決定済み` : `${total} 件中 ${left} 件が未決定`,
    takeAll: '推奨をすべて採用',
    keptIn: '保存先',
    reviewTitle: '結果を確認する',
    reviewDescription:
      '決めた内容を反映した後の行を、今のデータベースから読み出して表示します。見るだけでは何も変わりません。',
    nothingToPreview: 'スキーマの変更前に書き換わる行はありません。',
    losesData: (n: number) => `${n} 個のステップでデータや行が失われます。`,
    runTitle: 'マイグレーションを実行する',
    runDescription:
      'ステップを順に実行し、migration.sql を書き出して適用済みとして記録します。以降は Prisma Migrate の管理になります。',
    name: 'マイグレーション名',
    batch: '一度に変更する行数',
    batchHint:
      'これより多くの行を変更する修正は、この行数ずつ分けて実行し、ロックはその行の分だけ保持します。空欄なら修正ごとに 1 文で実行します。',
    runAll: '実行して記録',
    running: (done: number, total: number) => `${total} ステップ中 ${done} ステップ目を実行中…`,
    blocked: '先にデータの扱いを決めてください。',
    stale:
      '途中のステップが失敗しました。それより前のステップは実行済みのままです。もう一度比べると、今のデータベースから計画を作り直します。',
    oneByOne: '1ステップずつ実行する',
    record: '適用済みとして記録',
    recordNote: 'すべてのステップを実行しました。migration.sql を書き出して記録します。',
    recordFirst: '記録する前にすべてのステップを実行してください。',
    confirmTitle: 'データが失われるステップを実行しますか？',
    confirmNote:
      'データベース自体はこの操作を元に戻せません。失われたデータは、バックアップからのみ戻せます。',
    rehearseTitle: 'リハーサルする',
    rehearseDescription:
      '本番と同じ手順を、結果を残さない場所で実行します。すべてのステップが通るか、実行後にテーブルに何行残るかを確かめられます。',
    rehearseFailed: 'リハーサルを実行できませんでした。',
    backupFailed: 'バックアップを取れなかったため、何も実行していません。',
    restoreFailed: 'バックアップを復元できませんでした。',
    rehearseFirst: 'データが失われるマイグレーションです。先にリハーサルしてください。',
    rehearsalFailedBlock: 'リハーサルが成功していません。本番でも同じステップで止まります。',
    noBackup: 'バックアップを取りません。失われたデータは Studio から戻せません。',
    confirmRun: '実行する',
    planFailed: 'マイグレーションを計画できませんでした。',
    stepFailed: 'ステップを実行できませんでした。',
    writeFailed: 'マイグレーションを書き出せませんでした。',
    recordFailed: 'マイグレーションを記録できませんでした。',
    keepFailed: '決定を保存できませんでした。',
    deployFailed: 'マイグレーションを適用できませんでした。',
    baselineFailed: 'ベースラインを記録できませんでした。',
    recorded: (name: string) => `${name} を適用済みとして記録しました`,
    rolledBack: 'ロールバック済みとして記録しました',
    applied: (names: readonly string[]) =>
      names.length === 1 ? `${names[0] ?? ''} を適用しました` : `${names.length} 件を適用しました`,
  },
})

/** A check, said in a sentence: what the schema asks and how many rows are in the way. */
export const CHECKS = defineMessages({
  en: {
    'not-null': (f: Facts, n: number) =>
      `${f.model}.${f.field} becomes required, but ${rows(n)} ${n === 1 ? 'has' : 'have'} no value`,
    'column-added': (f: Facts, n: number) =>
      `${f.model} gets the required column ${f.field}, with no value for the ${rows(n)} already there`,
    enum: (f: Facts, n: number) =>
      `${rows(n)} of ${f.model}.${f.field} ${n === 1 ? 'holds' : 'hold'} ${f.removed === '' ? 'a value' : f.removed}, which the enum ${f.enum} no longer has`,
    unique: (f: Facts, n: number) =>
      `${f.model}.${f.fields} becomes unique, but ${n === 1 ? '1 group of rows shares' : `${n} groups of rows share`} a value`,
    'foreign-key': (f: Facts, n: number) =>
      `${f.model}.${f.field} will point at ${f.target}, but ${rows(n)} ${n === 1 ? 'points' : 'point'} at a ${f.target} that does not exist`,
    'column-dropped': (f: Facts, n: number) =>
      `The column ${f.model}.${f.column} goes away, and ${values(n)} with it`,
    'column-type': (f: Facts, n: number) =>
      `${f.model}.${f.field} changes from ${f.from} to ${f.to}; SQLite copies its ${values(n)} as they are`,
    'column-recreated': (f: Facts, n: number) =>
      `${f.model}.${f.field} cannot be cast from ${f.from} to ${f.to}: the column is dropped and added again, and ${values(n)} ${n === 1 ? 'is' : 'are'} lost`,
    'value-out-of-range': (f: Facts, n: number) =>
      `${values(n)} of ${f.model}.${f.field} ${n === 1 ? 'is' : 'are'} out of the range of ${f.to}`,
    'value-too-long': (f: Facts, n: number) =>
      `${values(n)} of ${f.model}.${f.field} ${n === 1 ? 'is' : 'are'} too long for ${f.to}`,
    'value-not-convertible': (f: Facts, n: number) =>
      `${values(n)} of ${f.model}.${f.field} cannot become ${f.to}`,
    'value-rounded': (f: Facts, n: number) =>
      `${values(n)} of ${f.model}.${f.field} will be rounded as they become ${f.to}`,
    'value-truncated': (f: Facts, n: number) =>
      `${values(n)} of ${f.model}.${f.field} will be cut short as they become ${f.to}`,
    'table-dropped': (f: Facts, n: number) =>
      `The table ${f.table} goes away, and its ${rows(n)} with it`,
    'delete-cascades': (f: Facts, n: number) =>
      /SET NULL/u.test(f.what ?? '')
        ? `${rows(n)} of ${f.subject} lose their key, as the rows they point at are deleted`
        : `${rows(n)} of ${f.subject} are deleted too, with the rows they point at`,
    'delete-refused': (f: Facts, n: number) =>
      `The database refuses to delete rows that ${rows(n)} of ${f.subject} still point at`,
    'update-cascades': (f: Facts, n: number) =>
      /SET NULL/u.test(f.what ?? '')
        ? `${rows(n)} of ${f.subject} lose their key, as the key they point at changes`
        : `${rows(n)} of ${f.subject} follow the key they point at to its new value`,
    'update-refused': (f: Facts, n: number) =>
      `The database refuses to change a key that ${rows(n)} of ${f.subject} still point at`,
    'check-constraint': (f: Facts, n: number) =>
      `The fixes leave ${rows(n)} that a CHECK constraint of the table refuses (${f.subject}): the database would stop the plan there`,
    'trigger-unfollowed': (f: Facts, n: number) =>
      `${f.subject} has ${n} ${n === 1 ? 'trigger' : 'triggers'} that fire as the fixes write to it, and the checks cannot follow what they do`,
    'move-ambiguous': (f: Facts, n: number) =>
      `${rows(n)} of ${f.model} ${n === 1 ? 'is' : 'are'} offered different values for ${f.subject}: the first is kept, the others go with the column`,
    other: (f: Facts, n: number) => `${f.subject}: ${f.what} (${n})`,
  },
  ja: {
    'not-null': (f: Facts, n: number) =>
      `${f.model}.${f.field} が必須になりますが、値が空（NULL）の行が ${n} 件あります`,
    'column-added': (f: Facts, n: number) =>
      `${f.model} に必須の列 ${f.field} が追加されますが、既存の ${n} 行に入れる値がありません`,
    enum: (f: Facts, n: number) =>
      `${f.model}.${f.field} の ${n} 行が、新しい ${f.enum} にない値${f.removed === '' ? '' : `（${f.removed}）`}を持っています`,
    unique: (f: Facts, n: number) =>
      `${f.model}.${f.fields} が一意になりますが、値が重複している組が ${n} 組あります`,
    'foreign-key': (f: Facts, n: number) =>
      `${f.model}.${f.field} が ${f.target} を参照するようになりますが、存在しない ${f.target} を指す行が ${n} 件あります`,
    'column-dropped': (f: Facts, n: number) =>
      `列 ${f.model}.${f.column} がなくなり、${n} 件の値が失われます`,
    'column-type': (f: Facts, n: number) =>
      `${f.model}.${f.field} の型が ${f.from} から ${f.to} に変わります。SQLite は ${n} 件の値をそのままコピーします`,
    'column-recreated': (f: Facts, n: number) =>
      `${f.model}.${f.field} は ${f.from} から ${f.to} に変換できないため列が作り直され、${n} 件の値が失われます`,
    'value-out-of-range': (f: Facts, n: number) =>
      `${f.model}.${f.field} の ${n} 件の値が ${f.to} の範囲を超えています`,
    'value-too-long': (f: Facts, n: number) =>
      `${f.model}.${f.field} の ${n} 件の値が ${f.to} には長すぎます`,
    'value-not-convertible': (f: Facts, n: number) =>
      `${f.model}.${f.field} の ${n} 件の値を ${f.to} に変換できません`,
    'value-rounded': (f: Facts, n: number) =>
      `${f.model}.${f.field} の ${n} 件の値が ${f.to} への変換で丸められます`,
    'value-truncated': (f: Facts, n: number) =>
      `${f.model}.${f.field} の ${n} 件の値が ${f.to} への変換で切り詰められます`,
    'table-dropped': (f: Facts, n: number) => `テーブル ${f.table} がなくなり、${n} 行が失われます`,
    'delete-cascades': (f: Facts, n: number) =>
      /SET NULL/u.test(f.what ?? '')
        ? `参照先の行が削除されるため、${f.subject} の ${n} 行の参照が空になります`
        : `参照先の行と一緒に、${f.subject} の ${n} 行も削除されます`,
    'delete-refused': (f: Facts, n: number) =>
      `${f.subject} の ${n} 行が参照しているため、データベースが削除を拒否します`,
    'update-cascades': (f: Facts, n: number) =>
      /SET NULL/u.test(f.what ?? '')
        ? `参照先のキーが変わるため、${f.subject} の ${n} 行の参照が空になります`
        : `参照先のキーが変わるのに合わせて、${f.subject} の ${n} 行も更新されます`,
    'update-refused': (f: Facts, n: number) =>
      `${f.subject} の ${n} 行が参照しているため、データベースがキーの変更を拒否します`,
    'check-constraint': (f: Facts, n: number) =>
      `修正後の ${n} 行が、テーブルの CHECK 制約（${f.subject}）に違反します。データベースがそこで計画の実行を拒否します`,
    'trigger-unfollowed': (f: Facts, n: number) =>
      `${f.subject} にはトリガーが ${n} 個あり、修正の書き込みで発火します。トリガーが行う変更はチェックでは追えません`,
    'move-ambiguous': (f: Facts, n: number) =>
      `${f.model} の ${n} 行に、${f.subject} へ入れる値の候補が複数あり一致しません。主キーが最も小さい行の値が残り、他は列と一緒に失われます`,
    other: (f: Facts, n: number) => `${f.subject}: ${f.what}（${n}）`,
  },
})

/**
 * What a check is about, without a count: the title of one already decided, whose count is of the
 * rows the decision leaves, and of a decision whose check has gone.
 */
export const TOPICS = defineMessages({
  en: {
    'not-null': (f: Facts) => `The empty values of ${f.model}.${f.field}, which becomes required`,
    'column-added': (f: Facts) =>
      `The rows already there, for the new required ${f.model}.${f.field}`,
    enum: (f: Facts) =>
      `The values of ${f.model}.${f.field} that ${f.enum ?? 'the enum'} no longer has`,
    unique: (f: Facts) =>
      `The duplicates of ${f.model}.${f.fields ?? f.field}, which becomes unique`,
    'foreign-key': (f: Facts) => `The rows of ${f.model}.${f.field} that point at nothing`,
    'column-dropped': (f: Facts) => `The values of the column ${f.model}.${f.column ?? f.field}`,
    'column-type': (f: Facts) => `The values of ${f.model}.${f.field}, as its type changes`,
    'column-recreated': (f: Facts) => `The values of ${f.model}.${f.field}, as its type changes`,
    other: (f: Facts) => `The values of ${f.model}.${f.field} the new type does not take`,
  },
  ja: {
    'not-null': (f: Facts) => `必須になる ${f.model}.${f.field} の空（NULL）の値`,
    'column-added': (f: Facts) => `必須の列 ${f.model}.${f.field} を追加するときの既存の行`,
    enum: (f: Facts) => `${f.model}.${f.field} のうち ${f.enum ?? 'enum'} にない値`,
    unique: (f: Facts) => `一意になる ${f.model}.${f.fields ?? f.field} の重複`,
    'foreign-key': (f: Facts) => `${f.model}.${f.field} の参照先がない行`,
    'column-dropped': (f: Facts) => `列 ${f.model}.${f.column ?? f.field} の値`,
    'column-type': (f: Facts) => `型が変わる ${f.model}.${f.field} の値`,
    'column-recreated': (f: Facts) => `型が変わる ${f.model}.${f.field} の値`,
    other: (f: Facts) => `${f.model}.${f.field} の新しい型に合わない値`,
  },
})

/** What each choice does, and what a choice that needs something written asks for. */
export const CHOICES = defineMessages({
  en: {
    value: 'Set a value',
    sql: 'Make the value with SQL',
    'keep-first-delete': 'Keep the first, delete the others',
    'keep-last-delete': 'Keep the last, delete the others',
    'keep-first-null': 'Keep the first, empty the others',
    'keep-last-null': 'Keep the last, empty the others',
    null: 'Set to empty (NULL)',
    delete: 'Delete the rows',
    clamp: 'Bring them within the range',
    truncate: 'Cut them to fit',
    rename: 'It was renamed: keep the values',
    move: 'It moved to another model: take the values along',
    drop: 'Let the values go',
    map: 'Move them to other members',
    losesRows: 'deletes rows',
    promptValue: 'The value',
    promptSql: 'SQL worked out for each row (it can name the columns of the row)',
    promptRename: 'The field it is called now',
    promptMove: 'The model and field it moved to, as Model.field (the two models are related)',
    promptMap: 'What each stored value becomes: STORED=MEMBER, separated by commas',
    promptOrder: 'The field that decides which row is first (the primary key when empty)',
    suggested: 'Suggested',
    decided: 'Decided',
    undecided: 'Not decided',
    use: 'Use this',
    change: 'Change',
    undo: 'Undo the decision',
    chosen: 'Chosen',
    sqlOfDecision: 'The SQL this decision runs',
    sqlInMigration:
      'This decision is written into the schema change itself (a rename, a conversion, a fill as the column is added): see its statements in the whole migration.sql.',
    empty: '(empty)',
    noDestination: 'No column this migration adds matches: type the name in full.',
    misfits: 'type differs',
    newTable: 'new table',
  },
  ja: {
    value: '決まった値を入れる',
    sql: 'SQL で値を作る',
    'keep-first-delete': '最初の1件を残し、他は削除する',
    'keep-last-delete': '最後の1件を残し、他は削除する',
    'keep-first-null': '最初の1件を残し、他は空にする',
    'keep-last-null': '最後の1件を残し、他は空にする',
    null: '空（NULL）にする',
    delete: '行を削除する',
    clamp: '範囲内に収める',
    truncate: '収まる長さで切る',
    rename: '名前が変わっただけ（値を引き継ぐ）',
    move: '別のモデルに移った（値を移す）',
    drop: '値を捨てる',
    map: '別のメンバーに置き換える',
    losesRows: '行が消えます',
    promptValue: '入れる値',
    promptSql: '行ごとに計算する SQL（その行の列名を使えます）',
    promptRename: '今の名前（新しいフィールド名）',
    promptMove: '移動先のモデルとフィールド（モデル.フィールド の形で。関連のあるモデルに限る）',
    promptMap: '置き換え方: 保存されている値=メンバー をカンマ区切りで',
    promptOrder: 'どの行を最初とみなすかを決める列（空欄なら主キー）',
    suggested: '推奨',
    decided: '決定済み',
    undecided: '未決定',
    use: 'この内容で決定',
    change: '変更する',
    undo: '決定を取り消す',
    chosen: '選択中',
    sqlOfDecision: 'この決定で実行される SQL',
    sqlInMigration:
      'この決定は、スキーマ変更の文そのものに書き込まれます（名前の変更、型の変換、列を追加するときの値の埋め込みなど）。「migration.sql の全体」で確認できます。',
    empty: '（空文字）',
    noDestination: '一致する追加列がありません。名前をそのまま入力してください。',
    misfits: '型が異なる',
    newTable: '新しいテーブル',
  },
})

/** Why a suggestion is the one offered. */
export const REASONS = defineMessages({
  en: {
    'schema-default': (f: Facts) => `The @default of the field: ${f.default}.`,
    uuid: () => 'A new UUID for each row, as @default(uuid()) makes them.',
    'random-id': () => 'A random id for each row, as the @default of the field makes them.',
    now: () => 'The date and time the migration runs.',
    'from-key': (f: Facts) =>
      `The column is unique, so each row gets its own value, made from its key: ${f.field}-1, ${f.field}-2, …`,
    'empty-string': () => 'An empty string, to be put right later.',
    zero: () => 'Zero.',
    false: () => 'false.',
    'empty-object': () => 'An empty JSON object.',
    'enum-first': (f: Facts) => `${f.member}, the first member of the enum.`,
    'enum-default': (f: Facts) => `${f.member}, the @default of the field.`,
    'enum-same-name': (f: Facts) =>
      `Each stored value becomes the member it spells, case and separators aside${f.member === '' ? '' : `; the others become ${f.member}, the @default or first member`}.`,
    'first-referenced': (f: Facts) =>
      `The column points at ${f.target}: each row gets the ${f.target} with the smallest key, so the foreign key holds. Point the rows at the right one afterwards.`,
    'enum-replaced': (f: Facts) =>
      `${f.removed} left the enum as ${f.member} came into it: it reads as a rename.`,
    oldest: (f: Facts) => `The row with the earliest ${f.orderBy} stays.`,
    'first-by-key': () => 'The row with the smallest primary key stays.',
    'optional-relation': () => 'The relation is optional: the rows stay, without it.',
    'required-relation': () =>
      'The relation is required: a row that points at nothing cannot stay.',
    renamed: (f: Facts) =>
      `${f.renamedTo} is added to the same table with a matching type: it reads as a rename.`,
    moved: (f: Facts) =>
      `${f.movedTo}, of a related model, is added under the same name and type: it reads as moved there. Each row gets the value of the row it is related to; a model the migration creates gets a row for each one with a value.`,
    'convert-number': (f: Facts) =>
      `Each value, blanks trimmed and an empty string read as NULL, becomes ${f.to}.`,
    clamp: () => 'Each value becomes the nearest the new type can hold.',
    truncate: () => 'Each value is cut to the length the new type holds.',
    nullable: () => 'The column may be empty.',
    'not-nullable': () => 'The column cannot be empty, so the rows go.',
  },
  ja: {
    'schema-default': (f: Facts) => `フィールドの @default の値（${f.default}）です。`,
    uuid: () => '@default(uuid()) と同じ形式の UUID を行ごとに作ります。',
    'random-id': () => 'フィールドの @default と同じく、行ごとにランダムな ID を作ります。',
    now: () => 'マイグレーションを実行した日時を入れます。',
    'from-key': (f: Facts) =>
      `一意な列なので、主キーから行ごとに違う値を作ります（${f.field}-1、${f.field}-2 …）。`,
    'empty-string': () => '空文字を入れます。後から正しい値に直せます。',
    zero: () => '0 を入れます。',
    false: () => 'false を入れます。',
    'empty-object': () => '空の JSON オブジェクトを入れます。',
    'enum-first': (f: Facts) => `enum の最初のメンバー ${f.member} にします。`,
    'enum-default': (f: Facts) => `フィールドの @default の ${f.member} にします。`,
    'enum-same-name': (f: Facts) =>
      `大文字小文字や区切り文字を無視して、同じ名前のメンバーに置き換えます${f.member === '' ? '' : `。一致しない値は ${f.member}（@default か最初のメンバー）にします`}。`,
    'first-referenced': (f: Facts) =>
      `この列は ${f.target} を参照しているため、存在しない値は入れられません。主キーが一番小さい ${f.target} を仮に指すようにします。後で正しい行を指すように直してください。`,
    'enum-replaced': (f: Facts) =>
      `${f.removed} がなくなり ${f.member} が増えているので、名前の変更と判断しました。`,
    oldest: (f: Facts) => `${f.orderBy} が一番古い行を残します。`,
    'first-by-key': () => '主キーが一番小さい行を残します。',
    'optional-relation': () => '任意のリレーションなので、参照だけを空にして行は残します。',
    'required-relation': () => '必須のリレーションなので、参照先のない行は残せません。',
    renamed: (f: Facts) =>
      `同じテーブルに型の合う ${f.renamedTo} が増えているので、名前の変更と判断しました。`,
    moved: (f: Facts) =>
      `関連するモデルに同じ名前・型の ${f.movedTo} が増えているので、そこへ移動したと判断しました。各行には関連する行の値が入ります。マイグレーションで新しく作られるモデルなら、値のある行ごとに行を作ります。`,
    'convert-number': (f: Facts) => `前後の空白を除き、空文字は NULL として ${f.to} に変換します。`,
    clamp: () => '新しい型に収まる一番近い値にします。',
    truncate: () => '新しい型に収まる長さで切ります。',
    nullable: () => '列が空を許すので、空にします。',
    'not-nullable': () => '列が空を許さないので、行を削除します。',
  },
})

/** One change a step makes to the schema. */
export const CHANGES = defineMessages({
  en: {
    'create-enum': (table: string) => `Creates the enum ${table}`,
    'create-table': (table: string) => `Creates the table ${table}`,
    'rebuild-table': (table: string) => `Rebuilds ${table} with its new columns, copying the rows`,
    'copy-rows': (table: string) => `Copies rows into ${table}`,
    'drop-table': (table: string) => `Drops the table ${table}, and every row in it`,
    'add-column': (table: string, columns: string) => `Adds ${table}.${columns}`,
    'drop-column': (table: string, columns: string) =>
      `Drops ${table}.${columns}, and what it holds`,
    'foreign-key': (table: string, columns: string, target: string) =>
      `Points ${table}.${columns} at ${target}`,
    unique: (table: string, columns: string) => `Makes ${table}.${columns} unique`,
    index: (table: string, columns: string) => `Indexes ${table}.${columns}`,
  },
  ja: {
    'create-enum': (table: string) => `enum ${table} を作成します`,
    'create-table': (table: string) => `テーブル ${table} を作成します`,
    'rebuild-table': (table: string) => `${table} を新しい列で作り直し、行をコピーします`,
    'copy-rows': (table: string) => `${table} に行をコピーします`,
    'drop-table': (table: string) => `テーブル ${table} を削除します（全行が失われます）`,
    'add-column': (table: string, columns: string) => `列 ${table}.${columns} を追加します`,
    'drop-column': (table: string, columns: string) =>
      `列 ${table}.${columns} を削除します（値が失われます）`,
    'foreign-key': (table: string, columns: string, target: string) =>
      `${table}.${columns} から ${target} への参照を作ります`,
    unique: (table: string, columns: string) => `${table}.${columns} を一意にします`,
    index: (table: string, columns: string) => `${table}.${columns} にインデックスを作ります`,
  },
})

/** The migration history. */
export const HISTORY = defineMessages({
  en: {
    migration: 'Migration',
    state: 'State',
    appliedAt: 'Applied',
    steps: 'Steps',
    action: 'What to do about it',
    applied: 'Applied',
    pending: 'Pending',
    edited: 'Edited after it ran',
    failed: 'Failed',
    rolledBack: 'Rolled back',
    markRolledBack: 'Mark rolled back',
    empty: (dir: string) => `No migrations in ${dir}.`,
    showSql: 'Show the SQL',
    hideSql: 'Hide the SQL',
    readingSql: 'Reading the migration.sql…',
    sqlUnreadable: 'The migration.sql could not be read.',
    noFile: 'No file',
    missingFiles: (dir: string) =>
      `The database records migrations that ${dir} does not hold: the directory was deleted, or never committed. What they ran cannot be shown. Restore the files, or, on a database that can be rebuilt, rebuild it.`,
  },
  ja: {
    migration: 'マイグレーション',
    state: '状態',
    appliedAt: '適用日時',
    steps: 'ステップ',
    action: '対応',
    applied: '適用済み',
    pending: '未適用',
    edited: '適用後に編集された',
    failed: '失敗',
    rolledBack: 'ロールバック済み',
    markRolledBack: 'ロールバック済みにする',
    empty: (dir: string) => `${dir} にマイグレーションはありません。`,
    showSql: 'SQL を表示',
    hideSql: 'SQL を隠す',
    readingSql: 'migration.sql を読み込んでいます…',
    sqlUnreadable: 'migration.sql を読み込めませんでした。',
    noFile: 'ファイルなし',
    missingFiles: (dir: string) =>
      `データベースには適用済みとして記録されているのに、${dir} にファイルがないマイグレーションがあります。フォルダが削除されたか、コミットされていません。何を実行したかは表示できません。ファイルを戻すか、作り直してよいデータベースなら作り直してください。`,
  },
})

/** The rows as the decisions leave them. */
export const PREVIEWS = defineMessages({
  en: {
    show: 'Show the rows',
    readAgain: 'Read again',
    unreadable: 'The rows could not be read.',
  },
  ja: {
    show: '行を表示',
    readAgain: '読み直す',
    unreadable: '行を読み込めませんでした。',
  },
})

/** A step of the plan. */
export const STEPS = defineMessages({
  en: {
    fix: (subject: string) => `Changes the rows of ${subject} as decided`,
    move: (subject: string) =>
      `Keeps the values that move into ${subject}, for the migration to write`,
    rowsToChange: (n: number) => `${rows(n)} to change`,
    rowsChanged: (n: number) => `${rows(n)} changed`,
    done: 'Done',
    losesData: 'loses data',
    statements: (n: number) => (n === 1 ? '1 statement' : `${n} statements`),
    run: 'Run',
    runAgain: 'Run again',
    schemaStep: 'Schema',
    dataStep: 'Data',
  },
  ja: {
    fix: (subject: string) => `決めた内容で ${subject} の行を書き換えます`,
    move: (subject: string) => `${subject} に移す値を、マイグレーションで書き込むまで退避します`,
    rowsToChange: (n: number) => `${n} 行を変更予定`,
    rowsChanged: (n: number) => `${n} 行を変更`,
    done: '完了',
    losesData: 'データが失われます',
    statements: (n: number) => `SQL ${n} 文`,
    run: '実行',
    runAgain: 'もう一度実行',
    schemaStep: 'スキーマ',
    dataStep: 'データ',
  },
})

/** A database with tables and no migration history, and baselining it. */
export const BASELINE = defineMessages({
  en: {
    title: 'This database has tables but no migration history',
    explain:
      'Prisma Migrate will not apply migrations to it (P3005, "The database schema is not empty"): the first migration would create tables that are already there. Baselining records the migrations the database already reflects as applied, without running them, and from then on only the migrations after them run.',
    checking:
      'Replaying each migration into an empty shadow database and comparing it with this one…',
    unreadable: 'The migrations could not be compared with the database.',
    matches: 'Matches the database',
    differs: 'Differs from the database',
    suggested: 'Suggested',
    showDifference: 'What the database has that the migrations up to here do not',
    record: 'Record this and every earlier migration as applied',
    recordNote:
      'Nothing is run and no data changes: only _prisma_migrations is written (and created when it is not there).',
    noMatch:
      'The database matches none of the migrations. Recording one would leave later migrations failing on what is missing or already there. Look at what differs, and bring the database or the migrations in line first.',
    recorded: (name: string) => `Baselined at ${name}`,
    blocked:
      'Baseline the database first: until then, the next migration cannot be planned against its history.',
  },
  ja: {
    title: 'このデータベースにはテーブルがありますが、マイグレーション履歴がありません',
    explain:
      'この状態では Prisma Migrate はマイグレーションを適用しません（P3005「The database schema is not empty」）。最初のマイグレーションが、既にあるテーブルを作ろうとしてしまうためです。ベースラインは、データベースに既に反映されているマイグレーションを、実行せずに適用済みとして記録する作業です。記録した後は、それより後のマイグレーションだけが実行されます。',
    checking:
      '各マイグレーションを空のシャドウデータベースで再生し、このデータベースと照合しています…',
    unreadable: 'マイグレーションとデータベースを照合できませんでした。',
    matches: 'データベースと一致',
    differs: 'データベースと違いあり',
    suggested: '推奨',
    showDifference: 'ここまでのマイグレーションになく、データベースにあるもの',
    record: 'ここまでのマイグレーションを適用済みとして記録',
    recordNote:
      '何も実行せず、データも変わりません。_prisma_migrations に記録するだけです（テーブルがなければ作成します）。',
    noMatch:
      'どのマイグレーションともデータベースが一致しません。このまま記録すると、後のマイグレーションが「無い」「既にある」ものに当たって失敗します。違いを確認し、先にデータベースかマイグレーションを揃えてください。',
    recorded: (name: string) => `${name} までをベースラインとして記録しました`,
    blocked:
      '先にベースラインを記録してください。記録するまで、次のマイグレーションは履歴に対して計画できません。',
  },
})

/** Kept decisions the schema or the database no longer has a place for. */
export const UNFIT = defineMessages({
  en: {
    title: 'Decisions that no longer fit the schema',
    explain:
      'These were decided for a field or model the schema no longer has as it was: it was removed or renamed after the decision was made. The plan is made without them. Delete them, and decide again if the change comes back.',
    decision: (subject: string, choice: string) => `${subject}: ${choice}`,
    remove: 'Delete this decision',
    removeAll: 'Delete all of them',
  },
  ja: {
    title: 'スキーマに合わなくなった決定',
    explain:
      '決めた後にフィールドやモデルが削除・名前変更されたため、今のスキーマに当てはまらない決定です。計画はこれらを除いて作っています。削除してください。同じ変更をまた行うときは、あらためて決めてください。',
    decision: (subject: string, choice: string) => `${subject}：${choice}`,
    remove: 'この決定を削除',
    removeAll: 'すべて削除',
  },
})

/** How the migration history of the database and the migrations directory differ, by the engine's name for it. */
export const DIVERGENCE = defineMessages({
  en: {
    databaseIsBehind: 'The migrations directory holds migrations the database has not applied.',
    migrationsDirectoryIsBehind:
      'The database records migrations the migrations directory does not hold.',
    historiesDiverge:
      'The database and the migrations directory agree up to a point, then record different migrations.',
  },
  ja: {
    databaseIsBehind: 'migrations フォルダに、データベースへ未適用のマイグレーションがあります。',
    migrationsDirectoryIsBehind:
      'データベースに、migrations フォルダにないマイグレーションが記録されています。',
    historiesDiverge:
      'データベースの記録と migrations フォルダの内容が、途中から別のマイグレーションになっています。',
  },
})

/** What the migration does to the data, said before anything runs. */
export const IMPACT = defineMessages({
  en: {
    title: 'What happens to the data',
    safe: 'No row or value is lost: every change keeps what the database holds.',
    losesTitle: (n: number) => (n === 1 ? '1 change loses data' : `${n} changes lose data`),
    losesNote:
      'Read what goes before it goes. A backup is taken before the run, and a rehearsal shows the result first.',
    show: 'See what is lost',
    hide: 'Hide',
    reading: 'Reading the values that go…',
    unreadable: 'The values could not be read.',
    none: 'Nothing is there to lose any more.',
    shown: (shown: number, total: number) =>
      shown < total
        ? `The first ${shown} of ${total}; the backup keeps every one of them.`
        : `All ${total}.`,
    csv: 'Save as CSV',
    changesRows: (n: number) =>
      n === 1 ? '1 step changes rows as decided' : `${n} steps change rows as decided`,
  },
  ja: {
    title: 'データに起きること',
    safe: '失われる行や値はありません。どの変更も、データベースにあるデータをそのまま残します。',
    losesTitle: (n: number) => `${n} 件の変更でデータが失われます`,
    losesNote:
      '消える前に、何が消えるかを確認できます。実行前にはバックアップを取り、リハーサルで結果を先に確かめられます。',
    show: '失われる値を見る',
    hide: '隠す',
    reading: '失われる値を読み込んでいます…',
    unreadable: '値を読み込めませんでした。',
    none: '失われる値はもうありません。',
    shown: (shown: number, total: number) =>
      shown < total
        ? `${total} 件のうち最初の ${shown} 件を表示しています。すべてバックアップに残ります。`
        : `${total} 件すべてを表示しています。`,
    csv: 'CSV で保存',
    changesRows: (n: number) => `${n} 個のステップで、決めた内容に沿って行を書き換えます`,
  },
})

/** The rehearsal: the migration run for real on a copy, or in a transaction taken back. */
export const REHEARSAL = defineMessages({
  en: {
    title: 'Rehearse',
    explainSqlite:
      'Runs every step, as the real run will, on a copy of the database file. The database itself does not change.',
    explainMysql:
      'Every step runs as it will for real, on a copy of the database made beside it (its tables, rows and triggers), which is dropped afterwards. The database itself does not change.',
    explainPostgres:
      'Runs every step, as the real run will, in a transaction that is rolled back whatever happens. The database itself does not change.',
    run: 'Rehearse the migration',
    again: 'Rehearse again',
    running: 'Rehearsing…',
    required: 'This migration loses data: rehearse it before running it.',
    recommended: 'Rehearse it first to see the result without changing anything.',
    passed: 'The rehearsal went through',
    failed: 'The rehearsal stopped at a step',
    failedNote:
      'The real run would stop at the same statement. Put right what the database says, then compare again.',
    unreadable: 'The migration could not be rehearsed.',
    step: (n: number) => `Step ${n}`,
    rows: (n: number) => (n === 1 ? '1 row' : `${n} rows`),
    notRun: 'Not run: a step before it failed',
    statement: 'The statement',
    tables: 'Rows in each table',
    table: 'Table',
    before: 'Before',
    after: 'After',
    change: 'Change',
    gone: 'removed',
    added: 'created',
    matches: 'The database it leaves matches the schema.',
    differs: 'The database it leaves still differs from the schema:',
    notCompared:
      'What the rehearsal leaves is not compared with the schema: no schema engine can read it here (the native engine cannot see inside the transaction the rehearsal ran in).',
    outsideTransaction:
      'A statement (an index made CONCURRENTLY, an enum value added) cannot run in a transaction, so this rehearsal cannot show it: the real run may still fail there.',
    locksTables:
      'The rehearsal ran in a transaction on this database and was rolled back: the tables it changes were locked while it ran. It gives up after five seconds of waiting for a lock rather than hold up the database.',
    stale: 'The plan has changed since it was rehearsed.',
  },
  ja: {
    title: 'リハーサル',
    explainSqlite:
      '本番と同じようにすべてのステップを、データベースファイルのコピーで実行します。データベース本体は変わりません。',
    explainMysql:
      '本番と同じようにすべてのステップを、隣に作ったデータベースのコピー（テーブル、行、トリガー）で実行し、終わったら削除します。データベース本体は変わりません。',
    explainPostgres:
      '本番と同じようにすべてのステップを、最後に必ずロールバックするトランザクションの中で実行します。データベース本体は変わりません。',
    run: 'リハーサルする',
    again: 'もう一度リハーサルする',
    running: 'リハーサル中…',
    required: 'このマイグレーションではデータが失われます。実行する前にリハーサルしてください。',
    recommended: '先にリハーサルすると、何も変えずに結果を確認できます。',
    passed: 'リハーサルは成功しました',
    failed: 'リハーサルが途中のステップで止まりました',
    failedNote:
      '本番でも同じ文で止まります。データベースが示す原因を直してから、もう一度比べてください。',
    unreadable: 'リハーサルを実行できませんでした。',
    step: (n: number) => `ステップ ${n}`,
    rows: (n: number) => `${n} 行`,
    notRun: '未実行（前のステップが失敗したため）',
    statement: '失敗した文',
    tables: 'テーブルごとの行数',
    table: 'テーブル',
    before: '実行前',
    after: '実行後',
    change: '増減',
    gone: '削除',
    added: '作成',
    matches: '実行後のデータベースはスキーマと一致します。',
    differs: '実行後もスキーマとの違いが残ります:',
    notCompared:
      'リハーサル後のデータベースはスキーマと比較していません。ここではそれを読める schema engine がないためです（ネイティブ版のエンジンは、リハーサルを実行したトランザクションの中を見られません）。',
    outsideTransaction:
      'トランザクションの中では実行できない文（CONCURRENTLY のインデックス作成、enum の値の追加）があるため、その文はリハーサルで確かめられません。本番ではそこで失敗する可能性があります。',
    locksTables:
      'リハーサルはこのデータベース上のトランザクションで実行し、ロールバックしました。実行中は変更対象のテーブルがロックされます。ロックを 5 秒待っても取れない場合は、データベースを止めないようにリハーサルを中断します。',
    stale: 'リハーサルした後に計画が変わりました。',
  },
})

/** Backups taken before a run, and putting the database back as one has it. */
export const BACKUPS = defineMessages({
  en: {
    take: 'Take a backup before running',
    takeNoteSqlite: 'A copy of the database file, kept in .hekireki/backups (ignored by git).',
    takePostgres:
      'Every table is copied into a schema of its own, with what it takes to make the schema again. A restore is checked against the database it was taken of before it is kept, and changes nothing otherwise.',
    taking: 'Taking a backup…',
    taken: (name: string) => `Backup ${name} taken`,
    failed: 'The backup could not be taken.',
    title: 'Backups',
    none: 'No backups yet. One is taken before a run that loses data.',
    takenAt: 'Taken',
    size: 'Size',
    where: 'Where',
    restore: 'Restore',
    restoreTitle: 'Put the database back as this backup has it?',
    restoreNote:
      'Every table, row and the migration history become what they were when the backup was taken. What changed since is replaced.',
    restoreRun: 'Restore',
    restored: (name: string) => `Restored ${name}`,
    restoreFailed: 'The backup could not be restored.',
    undoRun: 'Undo: restore the backup taken before the run',
    undoNote: (name: string) =>
      `The database goes back to ${name}, and the migration this run wrote is removed from the migrations directory.`,
    failureRestore: 'Restore the backup taken before the run',
  },
  ja: {
    take: '実行前にバックアップを取る',
    takeNoteSqlite:
      'データベースファイルのコピーを .hekireki/backups に保存します（git の管理対象外）。',
    takePostgres:
      '全テーブルを、スキーマを作り直すための定義と一緒に専用のスキーマへコピーします。復元は、取得時のデータベースと一致することを確かめてから確定し、一致しなければ何も変更しません。',
    taking: 'バックアップを取っています…',
    taken: (name: string) => `バックアップ ${name} を取りました`,
    failed: 'バックアップを取れませんでした。',
    title: 'バックアップ',
    none: 'バックアップはまだありません。データが失われる実行の前に取られます。',
    takenAt: '取得日時',
    size: 'サイズ',
    where: '場所',
    restore: '復元',
    restoreTitle: 'このバックアップの状態にデータベースを戻しますか？',
    restoreNote:
      'すべてのテーブル、行、マイグレーション履歴が、バックアップを取った時点に戻ります。それ以降の変更は置き換えられます。',
    restoreRun: '復元する',
    restored: (name: string) => `${name} を復元しました`,
    restoreFailed: 'バックアップを復元できませんでした。',
    undoRun: '元に戻す: 実行前のバックアップを復元',
    undoNote: (name: string) =>
      `データベースを ${name} の状態に戻し、この実行で書き出したマイグレーションを migrations フォルダから削除します。`,
    failureRestore: '実行前に取ったバックアップを復元する',
  },
})

/** What the run did, checked once it has finished. */
export const RESULT = defineMessages({
  en: {
    title: (name: string) => `${name} ran and is recorded`,
    matches: 'The database now matches the schema.',
    differs: 'The database still differs from the schema: compare again to see what is left.',
    rows: 'Rows in each table, before the run and after it',
    confirmType: (word: string) => `Type ${word} to run it`,
    confirmWord: 'migrate',
    dismiss: 'Close',
  },
  ja: {
    title: (name: string) => `${name} を実行し、記録しました`,
    matches: 'データベースはスキーマと一致しています。',
    differs: 'まだスキーマとの違いがあります。もう一度比べて、残っている違いを確認してください。',
    rows: 'テーブルごとの行数（実行前と実行後）',
    confirmType: (word: string) => `実行するには ${word} と入力してください`,
    confirmWord: 'migrate',
    dismiss: '閉じる',
  },
})

/** Where the values of a dropped column could have gone, ranked. */
export const CANDIDATES = defineMessages({
  en: {
    title: 'Where the values could have gone',
    note: 'Ranked by the likeness of the name and kind. Pick one to fill in the decision, then use it.',
    none: (n: number) =>
      `No column the migration adds reads as where these ${n === 1 ? 'value goes' : `${n} values go`}: left undecided, ${n === 1 ? 'it is' : 'they are'} lost. If they went somewhere, choose a rename or a move and name it.`,
    rename: (to: string) => `Renamed to ${to}`,
    move: (to: string) => `Moved to ${to}`,
    pick: 'Pick',
    picked: 'Picked',
    likeliest: 'Likeliest',
    lossNote: (n: number) =>
      n === 1
        ? '1 place these values could have gone: deciding it loses none.'
        : `${n} places these values could have gone: deciding one loses none.`,
  },
  ja: {
    title: '値の行き先の候補',
    note: '名前と型の近さで順位を付けています。選ぶと決定の入力欄に反映されます。確認してから決定してください。',
    none: (n: number) =>
      `マイグレーションで追加される列に、この ${n} 件の値の行き先らしいものがありません。決めないままだと失われます。どこかへ移したのなら、名前変更か移動を選んで行き先を入力してください。`,
    rename: (to: string) => `${to} に名前変更`,
    move: (to: string) => `${to} に移動`,
    pick: '選ぶ',
    picked: '選択中',
    likeliest: '最有力',
    lossNote: (n: number) => `行き先の候補が ${n} 件あります。どれかに決めれば値は失われません。`,
  },
})

/** Why a place is a candidate for the values of a dropped column. */
export const CANDIDATE_REASONS = defineMessages({
  en: {
    'same-name': 'The same name but for case and separators, in this table',
    'similar-name': 'A similar name, in this table',
    'same-name-related': 'The same name, in a related model',
    'similar-name-related': 'A similar name, in a related model',
  },
  ja: {
    'same-name': '同じテーブルに、同じ名前（大文字小文字・区切り文字の違いのみ）の列',
    'similar-name': '同じテーブルに、名前の似た列',
    'same-name-related': '関連するモデルに、同じ名前の列',
    'similar-name-related': '関連するモデルに、名前の似た列',
  },
})

/** How a decision migrates the data, said beside it as it is being made. */
export const HOW = defineMessages({
  en: {
    title: 'How it migrates',
    nothingChosen: 'Choose what becomes of the data to see how it migrates.',
    values: (n: number) => (n === 1 ? '1 value' : `${n} values`),
    rows: (n: number) => (n === 1 ? '1 row' : `${n} rows`),
    renamed: 'renamed',
    along: (via: string) => `along ${via}`,
    addedColumn: 'added column',
    newTable: 'new table',
    lost: 'lost',
    rename: (to: string, n: number) =>
      `The column is renamed to ${to}. Its ${n === 1 ? 'value stays' : `${n} values stay`} in the same rows: nothing is copied and nothing is lost.`,
    moveCreated: (model: string, via: string) =>
      `The migration creates ${model}. A ${model} row is made for each row with a value, pointing at it (${via}), with the value in it.`,
    movePointsHere: (model: string, source: string, via: string) =>
      `Each ${model} row gets the value of the ${source} row it points at (${via}). A ${source} row no ${model} points at has nowhere for its value to go.`,
    movePointedAt: (model: string, source: string, via: string) =>
      `Each ${model} row gets the value of a ${source} row that points at it (${via}). When several do, one of them is taken; a ${model} row nothing points at gets none.`,
    keepStep: (source: string) =>
      `Before the migration, the values of ${source} are kept with their keys in a table of their own.`,
    writeStep: (target: string, created: boolean) =>
      created
        ? `After the migration creates it, the rows of ${target.split('.')[0] ?? target} are made from them.`
        : `As the migration adds ${target}, it is filled from them.`,
    dropStep: 'The table they were kept in is dropped.',
    unknown: (value: string, move: boolean) =>
      value === ''
        ? move
          ? 'Name the model and field the column moved to.'
          : 'Name the field the column is called now.'
        : `${value} is not a column this migration adds ${move ? 'to a related model' : 'to this table'}: the plan will refuse it.`,
    misfit: (type: string) => `${type} may not take these values: check they read back as one.`,
    drop: (n: number) =>
      `${n === 1 ? 'The value is' : `The ${n} values are`} lost with the column. Only the backup taken before the run keeps ${n === 1 ? 'it' : 'them'}.`,
    fill: (n: number, what: string) =>
      `The ${n === 1 ? 'row' : `${n} rows`} with no value get ${what}; every other row keeps its own.`,
    fillAdded: (n: number, what: string) =>
      `The column is added without NOT NULL, the ${n === 1 ? 'row' : `${n} rows`} already there get ${what}, and only then is it made NOT NULL.`,
    sqlOf: (sql: string) => `the result of ${sql}, worked out for each row`,
    valueOf: (value: string) => (value === '' ? 'an empty string' : `'${value}'`),
    map: 'Each stored value becomes the member beside it before the enum changes:',
    stored: 'Stored',
    becomes: 'Becomes',
    keep: (fields: string, n: number, first: boolean, order: string, drop: boolean) =>
      `Of each group of rows sharing ${fields} (${n === 1 ? '1 group' : `${n} groups`}), the ${first ? 'first' : 'last'} by ${order} stays; the others are ${drop ? 'deleted' : 'kept with their key emptied'}.`,
    primaryKey: 'the primary key',
    orphansNull: (n: number, target: string) =>
      `The ${n === 1 ? 'row' : `${n} rows`} pointing at a ${target} that is not there keep everything but the key, which is emptied.`,
    orphansDelete: (n: number, target: string) =>
      `The ${n === 1 ? 'row' : `${n} rows`} pointing at a ${target} that is not there ${n === 1 ? 'is' : 'are'} deleted, with what points at ${n === 1 ? 'it' : 'them'} as the database's keys say.`,
    convert: (to: string, sql: string) =>
      `Each value becomes ${to} by ${sql}, in the migration's own change of the column.`,
    clamp: (n: number, to: string) =>
      `The ${n === 1 ? 'value' : `${n} values`} out of the range of ${to} become the nearest it holds.`,
    truncate: (n: number, to: string) =>
      `The ${n === 1 ? 'value' : `${n} values`} too long for ${to} are cut to the length it holds.`,
    invalidNull: (n: number) =>
      `The ${n === 1 ? 'value' : `${n} values`} the new type refuses become empty (NULL).`,
    invalidDelete: (n: number) =>
      `The ${n === 1 ? 'row' : `${n} rows`} whose value the new type refuses ${n === 1 ? 'is' : 'are'} deleted.`,
    now: 'Values now',
    noSample: 'No values to show.',
  },
  ja: {
    title: '移行のしかた',
    nothingChosen: 'データの扱いを選ぶと、どう移行するかがここに表示されます。',
    values: (n: number) => `${n} 件の値`,
    rows: (n: number) => `${n} 行`,
    renamed: '名前変更',
    along: (via: string) => `${via} をたどる`,
    addedColumn: '追加される列',
    newTable: '新しいテーブル',
    lost: '失われる',
    rename: (to: string, n: number) =>
      `列の名前を ${to} に変えます。${n} 件の値は同じ行に残ったままです。コピーも削除も起きません。`,
    moveCreated: (model: string, via: string) =>
      `${model} はこのマイグレーションで作られます。値のある行ごとに ${model} の行を1つ作り、${via} でその行を指すようにして、値を入れます。`,
    movePointsHere: (model: string, source: string, via: string) =>
      `${model} の各行に、その行が指す ${source} の行の値を入れます（${via}）。どの ${model} からも指されていない ${source} の行の値は、行き先がありません。`,
    movePointedAt: (model: string, source: string, via: string) =>
      `${model} の各行に、それを指す ${source} の行の値を入れます（${via}）。複数の行から指されている場合はそのうち1つの値を、どこからも指されていない行には何も入れません。`,
    keepStep: (source: string) =>
      `マイグレーションの前に、${source} の値をキーと一緒に一時テーブルへ退避します。`,
    writeStep: (target: string, created: boolean) =>
      created
        ? `マイグレーションで ${target.split('.')[0] ?? target} が作られた後、退避した値から行を作ります。`
        : `マイグレーションで ${target} が追加されるときに、退避した値で埋めます。`,
    dropStep: '退避に使ったテーブルを削除します。',
    unknown: (value: string, move: boolean) =>
      value === ''
        ? move
          ? '移動先のモデルとフィールドを入力してください。'
          : '新しいフィールド名を入力してください。'
        : `${value} は、このマイグレーションで${move ? '関連するモデル' : 'このテーブル'}に追加される列ではありません。このままではプランが作れません。`,
    misfit: (type: string) =>
      `${type} にはこの値が入らない可能性があります。変換して読めるか確認してください。`,
    drop: (n: number) =>
      `${n} 件の値は列と一緒に失われます。残るのは実行前に取ったバックアップの中だけです。`,
    fill: (n: number, what: string) =>
      `値のない ${n} 行に ${what}を入れます。ほかの行の値はそのままです。`,
    fillAdded: (n: number, what: string) =>
      `列をいったん NOT NULL なしで追加し、既存の ${n} 行に ${what}を入れてから NOT NULL にします。`,
    sqlOf: (sql: string) => `行ごとに ${sql} を計算した結果`,
    valueOf: (value: string) => (value === '' ? '空文字' : `「${value}」`),
    map: 'enum を変える前に、保存されている値をそれぞれ隣のメンバーに置き換えます:',
    stored: '保存されている値',
    becomes: '置き換え後',
    keep: (fields: string, n: number, first: boolean, order: string, drop: boolean) =>
      `${fields} が同じ行のグループ（${n} 組）ごとに、${order} の順で${first ? '最初' : '最後'}の行を残し、他は${drop ? '削除します' : 'キーを空にして残します'}。`,
    primaryKey: '主キー',
    orphansNull: (n: number, target: string) =>
      `存在しない ${target} を指す ${n} 行は、キーだけを空にして残します。`,
    orphansDelete: (n: number, target: string) =>
      `存在しない ${target} を指す ${n} 行を削除します。その行を指す行も、データベースのキーの設定に従って処理されます。`,
    convert: (to: string, sql: string) =>
      `列の型を変えるときに、各値を ${sql} で ${to} に変換します。`,
    clamp: (n: number, to: string) =>
      `${to} の範囲外の ${n} 件の値を、入る範囲の一番近い値にします。`,
    truncate: (n: number, to: string) => `${to} には長すぎる ${n} 件の値を、入る長さで切ります。`,
    invalidNull: (n: number) => `新しい型に入らない ${n} 件の値を空（NULL）にします。`,
    invalidDelete: (n: number) => `新しい型に入らない値を持つ ${n} 行を削除します。`,
    now: '今の値',
    noSample: '表示できる値はありません。',
  },
})
