<template>
  <div class="landing">
    <header class="landing-header">
      <router-link to="/" class="landing-brand"><span class="brand-mark">Q</span><span>QCanva</span></router-link>
      <nav class="landing-nav" aria-label="Навигация"><a href="#features">Возможности</a><a href="#workflow">Как работает</a></nav>
      <div class="landing-actions"><router-link to="/login" class="landing-login">Войти</router-link><router-link to="/register" class="landing-register">Начать бесплатно</router-link></div>
    </header>

    <main>
      <section class="landing-hero">
        <div class="hero-copy">
          <div class="hero-kicker"><span></span> Пространство для идей и совместной работы</div>
          <h1>Собирайте мысли<br><em>в одну картину.</em></h1>
          <p>QCanva объединяет бесконечные канвасы, документы и интерактивные шаблоны. Планируйте, обсуждайте и создавайте вместе — без переключения между сервисами.</p>
          <div class="hero-buttons"><router-link to="/register" class="hero-primary">Создать пространство <span>→</span></router-link><a href="#workflow" class="hero-secondary">Посмотреть, как это работает</a></div>
          <div class="hero-note"><span class="avatars"><i>Я</i><i>А</i><i>+</i></span> Уже готово для вашей команды, проекта или кампании</div>
        </div>
        <div class="hero-visual" aria-label="Пример канваса">
          <div class="visual-toolbar"><span class="visual-logo">Q</span><span></span><span></span><span></span><b>Поделиться</b></div>
          <div class="canvas-grid"></div>
          <div class="canvas-card card-plan"><small>ПЛАН</small><strong>Запуск проекта</strong><div><i></i><i></i><i></i></div></div>
          <div class="canvas-card card-note"><span>✦</span><strong>Идея</strong><p>Собрать всё важное в одном месте</p></div>
          <div class="canvas-card card-doc"><small>ДОКУМЕНТ</small><strong>Исследование</strong><p>Контекст, решения и ссылки для команды.</p></div>
          <svg class="canvas-lines" viewBox="0 0 600 410" fill="none" preserveAspectRatio="none"><path d="M215 164 C276 166 272 237 355 241"/><path d="M209 178 C250 251 154 284 143 304"/></svg>
          <div class="cursor cursor-one"><b></b><span>Ярослав</span></div><div class="cursor cursor-two"><b></b><span>Анна</span></div>
        </div>
      </section>

      <section id="features" class="landing-features">
        <div class="section-intro"><span>ВОЗМОЖНОСТИ</span><h2>Не просто доска.<br>Рабочее пространство.</h2></div>
        <article><div class="feature-icon violet">⌘</div><h3>Бесконечные канвасы</h3><p>Связывайте идеи, файлы, изображения и вложенные канвасы на одной поверхности.</p></article>
        <article><div class="feature-icon coral">↗</div><h3>Документы рядом</h3><p>HTML-страницы и заметки живут рядом с канвасами, а не теряются в папках.</p></article>
        <article><div class="feature-icon mint">◌</div><h3>Работа вместе</h3><p>Совместное редактирование, доступы, история изменений и чат прямо на канвасе.</p></article>
      </section>

      <section id="workflow" class="landing-workflow"><div><span>ОДНО ПРОСТРАНСТВО</span><h2>От первой мысли<br>до готового результата.</h2><p>Создайте канвас, добавьте документы, пригласите участников и держите весь контекст проекта под рукой.</p><router-link to="/register" class="text-cta">Попробовать QCanva <b>→</b></router-link></div><ol><li><b>01</b><div><strong>Создайте</strong><p>Канвас, документ или интерактивный шаблон.</p></div></li><li><b>02</b><div><strong>Соберите контекст</strong><p>Соедините заметки, ссылки, картинки и файлы.</p></div></li><li><b>03</b><div><strong>Делайте вместе</strong><p>Откройте доступ команде и работайте в реальном времени.</p></div></li></ol></section>

      <section class="landing-final"><span>НАЧНИТЕ СЕЙЧАС</span><h2>Ваше следующее<br>пространство ждёт.</h2><router-link to="/register" class="hero-primary">Создать бесплатно <span>→</span></router-link></section>
    </main>
    <footer class="landing-footer"><span>© {{ year }} QCanva</span><router-link :to="{ name: 'dashboard' }">Открыть дашборд</router-link></footer>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
export default defineComponent({ setup: () => ({ year: new Date().getFullYear() }) });
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@0,700;0,800;1,700;1,800&display=swap');
.landing{--ink:#191724;--muted:#746f80;--paper:#f7f5f0;--line:#ded9d4;--purple:#6658e8;min-height:100vh;background:var(--paper);color:var(--ink);font-family:Manrope,Arial,sans-serif}.landing-header{height:78px;max-width:1230px;padding:0 28px;margin:auto;display:flex;align-items:center;justify-content:space-between}.landing-brand{display:flex;gap:9px;align-items:center;color:var(--ink);font-weight:800;font-size:19px;text-decoration:none}.brand-mark{display:grid;place-items:center;width:27px;height:27px;background:var(--ink);border-radius:8px;color:#fff;font-family:'Playfair Display',serif;font-size:17px}.landing-nav{display:flex;gap:29px;margin-left:100px}.landing-nav a,.landing-login,.landing-footer a{font-size:13px;color:#5d5868;text-decoration:none}.landing-actions{display:flex;align-items:center;gap:19px}.landing-register{padding:10px 15px;border-radius:8px;color:#fff;background:var(--ink);font-size:13px;font-weight:700;text-decoration:none}.landing-hero{max-width:1174px;min-height:600px;margin:27px auto 88px;padding:52px 54px;display:grid;grid-template-columns:.88fr 1.12fr;gap:40px;box-sizing:border-box;border-radius:26px;background:#e9e5fc;overflow:hidden}.hero-copy{position:relative;z-index:2;align-self:center}.hero-kicker,.section-intro>span,.landing-workflow>div>span,.landing-final>span{display:flex;gap:7px;align-items:center;color:#625a82;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.12em}.hero-kicker span{width:7px;height:7px;border-radius:50%;background:#fe806b}.hero-copy h1{margin:18px 0 20px;font-size:52px;letter-spacing:-.06em;line-height:1.06}.hero-copy h1 em{font-family:'Playfair Display',serif;font-weight:700}.hero-copy p{max-width:430px;color:#635d75;font-size:15px;line-height:1.7}.hero-buttons{display:flex;gap:13px;flex-wrap:wrap;margin-top:29px;align-items:center}.hero-primary{display:inline-flex;gap:20px;align-items:center;padding:14px 17px;border-radius:9px;color:#fff;background:var(--ink);font-size:13px;font-weight:700;text-decoration:none}.hero-primary span{font-size:19px;line-height:.7}.hero-secondary{color:#484158;font-size:12px;font-weight:700;text-decoration:none}.hero-note{display:flex;align-items:center;gap:10px;margin-top:34px;color:#716b83;font-size:11px}.avatars{display:flex}.avatars i{display:grid;place-items:center;width:24px;height:24px;margin-right:-5px;border:2px solid #e9e5fc;border-radius:50%;font-style:normal;font-size:9px;background:#ffc8b8}.avatars i:nth-child(2){background:#b8e2d3}.avatars i:last-child{background:#fff;color:#716b83}.hero-visual{position:relative;min-height:420px;border-radius:16px;background:#252334;box-shadow:0 28px 55px rgba(61,49,115,.23);overflow:hidden;transform:rotate(2deg)}.visual-toolbar{position:absolute;z-index:3;inset:0 0 auto;height:42px;padding:0 13px;display:flex;gap:8px;align-items:center;border-bottom:1px solid #48445a;background:#302d40}.visual-toolbar span:not(.visual-logo){width:16px;height:5px;border-radius:4px;background:#5c576e}.visual-toolbar b{margin-left:auto;padding:5px 8px;border-radius:5px;background:#7666e9;color:#fff;font-size:8px}.visual-logo{display:grid;place-items:center;width:19px;height:19px;border-radius:5px;background:#fff;color:#252334;font-family:serif;font-weight:bold}.canvas-grid{position:absolute;inset:42px 0 0;background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px);background-size:24px 24px}.canvas-card{position:absolute;z-index:2;padding:14px;border-radius:9px;box-shadow:0 9px 20px #0003}.canvas-card small{display:block;margin-bottom:8px;font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.12em}.canvas-card strong{display:block;font-size:14px}.canvas-card p{margin:8px 0 0;color:#5d566d;font-size:10px;line-height:1.4}.card-plan{top:91px;left:51px;width:144px;background:#fff6cf;color:#41391c}.card-plan div{display:flex;gap:4px;margin-top:14px}.card-plan i{width:20px;height:4px;border-radius:4px;background:#e8bc55}.card-note{top:222px;left:66px;width:118px;background:#efc4f2;color:#472d4b}.card-note span{display:block;margin-bottom:8px}.card-doc{top:168px;right:52px;width:145px;background:#e4f1ff}.canvas-lines{position:absolute;z-index:1;inset:42px 0 0;width:100%;height:calc(100% - 42px);stroke:#a99dff;stroke-width:2}.cursor{position:absolute;z-index:4;display:flex;align-items:center;gap:3px;color:#fff;font-size:8px}.cursor b{display:block;width:0;height:0;border-left:7px solid transparent;border-right:2px solid transparent;border-bottom:15px solid #ff8370;transform:rotate(-38deg)}.cursor span{padding:3px 5px;border-radius:4px;background:#ff8370}.cursor-one{top:182px;left:268px}.cursor-two{right:84px;bottom:86px}.cursor-two b{border-bottom-color:#63c5ad}.cursor-two span{background:#63c5ad}.landing-features{max-width:1120px;margin:0 auto 115px;padding:0 26px;display:grid;grid-template-columns:1.2fr repeat(3,1fr);gap:27px}.section-intro h2,.landing-workflow h2,.landing-final h2{margin:14px 0 0;font-size:33px;letter-spacing:-.05em;line-height:1.12}.landing-features article{padding:4px 0}.feature-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:10px;font-size:19px}.violet{background:#e9e5fc;color:#6658e8}.coral{background:#ffe1d5;color:#e5775f}.mint{background:#d9f2ea;color:#35a080}.landing-features h3{margin:16px 0 8px;font-size:15px}.landing-features p{margin:0;color:var(--muted);font-size:12px;line-height:1.6}.landing-workflow{max-width:1120px;margin:0 auto 105px;padding:56px 62px;display:grid;grid-template-columns:1fr 1fr;gap:90px;border-radius:18px;background:#fff;border:1px solid var(--line)}.landing-workflow>div p{max-width:390px;color:var(--muted);font-size:13px;line-height:1.6}.text-cta{display:inline-flex;gap:12px;margin-top:14px;color:var(--purple);font-size:13px;font-weight:800;text-decoration:none}.landing-workflow ol{margin:5px 0;padding:0;list-style:none}.landing-workflow li{display:flex;gap:20px;padding:18px 0;border-bottom:1px solid #ebe7e2}.landing-workflow li:last-child{border:0}.landing-workflow li>b{color:#a49dac;font:11px 'DM Mono',monospace}.landing-workflow strong{font-size:14px}.landing-workflow li p{margin:4px 0 0;color:var(--muted);font-size:12px}.landing-final{max-width:1174px;margin:0 auto 44px;padding:65px;text-align:center;box-sizing:border-box;border-radius:23px;background:#22202d;color:#fff}.landing-final>span{justify-content:center;color:#a69ebd}.landing-final h2{margin:14px 0 26px;font-size:47px}.landing-final .hero-primary{background:#f4f1ea;color:#24222e}.landing-footer{max-width:1174px;padding:0 25px 32px;margin:auto;display:flex;justify-content:space-between;color:#8b8591;font-size:11px}@media(max-width:800px){.landing-header{height:66px;padding:0 18px}.landing-nav{display:none}.landing-login{display:none}.landing-hero{margin:10px 12px 60px;padding:37px 25px;grid-template-columns:1fr;min-height:0}.hero-copy h1{font-size:43px}.hero-visual{min-height:315px;margin-top:6px}.landing-features{grid-template-columns:1fr;margin-bottom:60px;padding:0 28px;gap:25px}.landing-workflow{margin:0 14px 65px;padding:35px 26px;grid-template-columns:1fr;gap:26px}.landing-final{margin:0 12px 30px;padding:48px 22px}.landing-final h2{font-size:39px}.landing-footer{padding:0 18px 25px}.card-doc{right:25px}.cursor-one{left:220px}}
</style>

<style scoped>
/* Keep the landing in the same Frox/QCanva visual system as the app. */
.landing {
  --ink: var(--dark-text-primary);
  --muted: var(--dark-text-muted);
  --paper: #0f0f12;
  --line: var(--dark-neutral-border);
  --purple: var(--color-brands);
  background: #0f0f12;
  font-family: 'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.landing-header { border-bottom: 1px solid var(--dark-neutral-border); }
.landing-brand { color: var(--dark-text-primary); }
.brand-mark { color: var(--color-brand-on); background: var(--color-brands); border-radius: var(--radius-sm); font-family: inherit; }
.landing-nav a, .landing-login, .landing-footer a { color: var(--dark-text-secondary); }
.landing-register { color: var(--color-brand-on); background: var(--color-brands); border-radius: var(--radius-sm); }
.landing-hero { background: linear-gradient(135deg, rgba(0,42,0,.7), rgba(31,33,40,.98)); border: 1px solid var(--dark-neutral-border); border-radius: var(--radius-xl); }
.hero-kicker, .section-intro>span, .landing-workflow>div>span, .landing-final>span { color: var(--color-brands-light); font-family: inherit; font-weight: 700; }
.hero-kicker span { background: var(--color-brands); }
.hero-copy h1 { color: var(--dark-text-primary); letter-spacing: -.045em; }
.hero-copy h1 em { color: var(--color-brands); font-family: inherit; font-style: normal; }
.hero-copy p { color: var(--dark-text-secondary); }
.hero-primary { color: var(--color-brand-on); background: var(--color-brands); border-radius: var(--radius-sm); }
.hero-primary:hover, .landing-register:hover { background: var(--color-brands-light); }
.hero-secondary { color: var(--dark-text-primary); }
.hero-note { color: var(--dark-text-muted); }
.avatars i { border-color: #102010; color: var(--color-brand-on); background: var(--color-brands); }
.avatars i:nth-child(2) { background: var(--accent-green); }.avatars i:last-child { color: var(--dark-text-primary); background: var(--dark-neutral-bg); }
.hero-visual { border: 1px solid var(--dark-neutral-border); border-radius: var(--radius-lg); background: var(--dark-neutral-bg); box-shadow: var(--shadow-card); transform: rotate(0); }
.visual-toolbar { background: rgba(0,32,0,.84); border-bottom-color: var(--dark-neutral-border); }.visual-toolbar b { color: var(--color-brand-on); background: var(--color-brands); }.visual-logo { color: var(--color-brand-on); background: var(--color-brands); }
.card-plan { color: var(--dark-text-primary); background: rgba(0,42,0,.95); border: 1px solid #22502a; }.card-plan i { background: var(--color-brands); }
.card-note { color: #102515; background: var(--accent-green); }.card-doc { color: var(--dark-text-primary); background: #292d37; border: 1px solid #444958; }.canvas-card p { color: var(--dark-text-secondary); }.canvas-lines { stroke: var(--color-brands); opacity: .75; }
.landing-features article { padding: 20px; border: 1px solid var(--dark-neutral-border); border-radius: var(--radius-md); background: var(--dark-card-bg); }.section-intro { padding: 20px 0; }.feature-icon { color: var(--color-brand-on); background: var(--color-brands); }.coral { background: var(--accent-yellow); }.mint { background: var(--accent-green); }.landing-features h3 { color: var(--dark-text-primary); }.landing-features p { color: var(--dark-text-muted); }
.landing-workflow { background: var(--dark-card-bg); border-color: var(--dark-neutral-border); border-radius: var(--radius-lg); }.landing-workflow>div p, .landing-workflow li p { color: var(--dark-text-muted); }.landing-workflow li { border-bottom-color: var(--dark-neutral-border); }.landing-workflow li>b { color: var(--color-brands); }.landing-workflow strong { color: var(--dark-text-primary); }.text-cta { color: var(--color-brands); }
.landing-final { background: linear-gradient(135deg, #003b09, #0f0f12); border: 1px solid #22502a; border-radius: var(--radius-xl); }.landing-final .hero-primary { background: var(--color-brands); color: var(--color-brand-on); }.landing-footer { color: var(--dark-text-muted); }
@media(max-width:800px) { .landing-header { border-bottom: 0; } .landing-features article { padding: 18px; } }
</style>
