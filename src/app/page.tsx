import Link from 'next/link'

const features = [
  {
    num: '01',
    title: 'ページを作る',
    body: 'タイトルを入れるだけ。URLも自動で作られる。',
    tag: '基本',
    color: 'var(--color-energy-info)',
  },
  {
    num: '02',
    title: 'AIでページを一気に作る',
    body: '「こういうページが欲しい」と書くだけ。AIがページ全体を生成する。',
    tag: 'AI生成',
    color: 'var(--color-energy-purpose)',
  },
  {
    num: '03',
    title: '自分で自由に編集できる',
    body: '文字を書き換える、ブロックを追加・削除、構成を変える。気になるところをそのまま直せる。',
    tag: 'エディタ',
    color: 'var(--color-energy-trust)',
  },
  {
    num: '04',
    title: '"部分だけ"AIに任せる',
    body: '選んだブロックだけAIで作り直せる。全体を壊さずピンポイントで改善できる。',
    tag: '部分AI',
    color: 'var(--color-accent)',
    highlight: true,
  },
  {
    num: '05',
    title: '編集の履歴が残る',
    body: 'すべての変更がログとして残る。過去のアイデアを振り返り、自分の"思考の履歴"が蓄積される。',
    tag: 'タイムライン',
    color: 'var(--color-energy-action)',
  },
  {
    num: '06',
    title: '保存・公開できる',
    body: '自動保存あり。ボタン1つで公開、URLですぐ共有できる。',
    tag: '公開',
    color: 'var(--color-energy-trust)',
  },
  {
    num: '07',
    title: '使うほど"自分に合っていく"',
    body: '編集ログをもとにAIが学習。よく使う構成、好きな言葉のクセ、よく直すポイントを把握していく。',
    tag: '学習',
    color: 'var(--color-energy-purpose)',
    future: true,
  },
  {
    num: '08',
    title: 'デザインも"育つ"',
    body: '色の傾向、レイアウトのクセ、見せ方のスタイル。使えば使うほどサイトが自分の好みに寄っていく。',
    tag: 'デザイン進化',
    color: 'var(--color-energy-emotion)',
    future: true,
  },
  {
    num: '09',
    title: 'アイデアが湧く仕組み',
    body: '過去ログ × AI = 新しい発想。過去の編集からヒントが出て、AIが組み合わせて提案する。',
    tag: 'インサイト',
    color: 'var(--color-energy-action)',
    future: true,
  },
  {
    num: '10',
    title: 'ページ診断（ABCDE理論）',
    body: 'ページを感覚じゃなく構造で分析。どこで弱いのか、どこを強化すべきか、改善ポイントが明確になる。',
    tag: '診断',
    color: 'var(--color-energy-info)',
  },
]

export default function TopPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', fontFamily: 'var(--font-ui)' }}>

      {/* bg art */}
      <div className="atelier-bg" aria-hidden />
      <div className="atelier-bg-grain" aria-hidden />

      {/* nav */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 40px', height: 'var(--topbar-height)',
        background: 'rgba(248,248,248,0.90)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase' }}>
          Atelier
        </span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link href="/cms/pages" className="atelier-btn atelier-btn--ghost" style={{ fontSize: 12 }}>
            ページ一覧
          </Link>
          <Link href="/cms/new" className="atelier-btn atelier-btn--primary" style={{ fontSize: 12 }}>
            はじめる →
          </Link>
        </div>
      </header>

      <main style={{ position: 'relative', zIndex: 1 }}>

        {/* hero */}
        <section style={{ textAlign: 'center', padding: '100px 40px 80px' }}>
          <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 20 }}>
            Patch-driven website builder
          </p>
          <h1 style={{ fontSize: 52, fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.15, color: 'var(--color-text-primary)', marginBottom: 24 }}>
            作る → 直す → 残る<br />
            <span style={{ color: 'var(--color-accent)', fontWeight: 500 }}>学ぶ → 進化する</span>
          </h1>
          <p style={{ fontSize: 16, color: 'var(--color-text-secondary)', maxWidth: 480, margin: '0 auto 40px', lineHeight: 1.7 }}>
            「ページを作る」ではなく、<br />自分の思考とセンスがどんどん洗練されていく場所。
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Link href="/cms/new" className="atelier-btn atelier-btn--primary" style={{ padding: '10px 28px', fontSize: 14 }}>
              新規ページを作成
            </Link>
            <Link href="/cms/pages" className="atelier-btn" style={{ padding: '10px 28px', fontSize: 14 }}>
              既存ページを開く
            </Link>
          </div>
        </section>

        {/* divider */}
        <div style={{ maxWidth: 800, margin: '0 auto', height: 1, background: 'var(--color-divider)' }} />

        {/* features */}
        <section style={{ maxWidth: 960, margin: '0 auto', padding: '80px 40px' }}>
          <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 48, textAlign: 'center' }}>
            できること
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {features.map((f) => (
              <div
                key={f.num}
                style={{
                  background: f.highlight ? 'rgba(212,175,55,0.04)' : 'var(--color-surface)',
                  border: f.highlight ? '1px solid rgba(212,175,55,0.25)' : '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '24px',
                  position: 'relative',
                  boxShadow: f.highlight ? '0 4px 20px rgba(212,175,55,0.08)' : 'var(--shadow-sm)',
                  opacity: f.future ? 0.6 : 1,
                }}
              >
                {/* number */}
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500,
                  letterSpacing: '0.08em', color: f.color, display: 'block', marginBottom: 10,
                }}>
                  {f.num}
                </span>

                {/* title */}
                <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8, lineHeight: 1.4 }}>
                  {f.title}
                </h2>

                {/* body */}
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
                  {f.body}
                </p>

                {/* tag */}
                <span style={{
                  position: 'absolute', top: 20, right: 20,
                  fontSize: 9, fontWeight: 500, letterSpacing: '0.06em',
                  padding: '2px 8px', borderRadius: 20,
                  background: 'var(--color-surface-3)', color: 'var(--color-text-tertiary)',
                }}>
                  {f.future ? '近日公開' : f.tag}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* cta */}
        <section style={{ textAlign: 'center', padding: '60px 40px 100px' }}>
          <div style={{
            display: 'inline-block',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-xl)',
            padding: '48px 64px',
            boxShadow: 'var(--shadow-md)',
          }}>
            <h2 style={{ fontSize: 24, fontWeight: 500, marginBottom: 12, color: 'var(--color-text-primary)' }}>
              さっそく試してみる
            </h2>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 28 }}>
              新しいページを作るだけで、すべての機能が使えます。
            </p>
            <Link href="/cms/new" className="atelier-btn atelier-btn--primary" style={{ padding: '11px 32px', fontSize: 14 }}>
              新規ページを作成 →
            </Link>
          </div>
        </section>

      </main>

      {/* footer */}
      <footer style={{
        borderTop: '1px solid var(--color-border)',
        padding: '24px 40px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        color: 'var(--color-text-ghost)', fontSize: 11, letterSpacing: '0.04em',
      }}>
        <span style={{ fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Atelier</span>
        <span>Patch-driven website builder</span>
      </footer>

    </div>
  )
}
