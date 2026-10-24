import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useScroll, useTransform, useSpring, useInView } from "motion/react";
import Lenis from "lenis";
import earth from "@/src/assets/earth-limb.jpg";
import atmosphere from "@/src/assets/atmosphere.jpg";
import lab from "@/src/assets/lab.jpg";
import electronics from "@/src/assets/electronics.jpg";

const Cosmos = lazy(() => import("./components/Cosmos"));

const EASE = [0.16, 1, 0.3, 1] as const;

function useSmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
    let id = 0;
    const raf = (t: number) => {
      lenis.raf(t);
      id = requestAnimationFrame(raf);
    };
    id = requestAnimationFrame(raf);
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a) return;
      e.preventDefault();
      lenis.scrollTo(a.getAttribute("href")!, { offset: -20, duration: 1.6 });
    };
    document.addEventListener("click", onClick);
    return () => {
      cancelAnimationFrame(id);
      lenis.destroy();
      document.removeEventListener("click", onClick);
    };
  }, []);
}

/* Masked line reveal: text slides up from behind its own baseline */
function Line({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  return (
    <span ref={ref} className={`block overflow-hidden pb-[0.08em] ${className}`}>
      <motion.span
        className="block"
        initial={{ y: "110%", rotate: 2 }}
        animate={inView ? { y: "0%", rotate: 0 } : {}}
        transition={{ duration: 1.3, delay, ease: EASE }}
      >
        {children}
      </motion.span>
    </span>
  );
}

function Fade({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 1.1, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* Photo that wipes open, then drifts with scroll — like a camera move */
function Photo({
  src,
  alt,
  className = "",
  ratio = "aspect-[3/2]",
}: {
  src: string;
  alt: string;
  className?: string;
  ratio?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], ["-8%", "8%"]);
  const ys = useSpring(y, { stiffness: 80, damping: 30, mass: 0.6 });
  return (
    <motion.div
      ref={ref}
      className={`relative overflow-hidden bg-muted ${ratio} ${className}`}
      initial={{ clipPath: "inset(100% 0% 0% 0%)" }}
      whileInView={{ clipPath: "inset(0% 0% 0% 0%)" }}
      viewport={{ once: true, margin: "-15% 0px" }}
      transition={{ duration: 1.6, ease: EASE }}
    >
      <motion.img
        src={src}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        style={{ y: ys }}
        initial={{ scale: 1.35 }}
        whileInView={{ scale: 1.18 }}
        viewport={{ once: true }}
        transition={{ duration: 2.4, ease: EASE }}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </motion.div>
  );
}

function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const p = useSpring(scrollYProgress, { stiffness: 70, damping: 28, mass: 0.5 });
  const scale = useTransform(p, [0, 1], [1.08, 1.35]);
  const imgY = useTransform(p, [0, 1], ["0%", "18%"]);
  const textY = useTransform(p, [0, 1], ["0%", "-40%"]);
  const opacity = useTransform(p, [0, 0.7], [1, 0]);
  return (
    <section ref={ref} className="relative h-[100svh] min-h-[640px] overflow-hidden">
      <motion.div className="absolute inset-0" style={{ y: imgY }}>
        <motion.img
          src={earth}
          alt="Sunrise over Earth's atmosphere seen from orbit"
          width={1920}
          height={1088}
          referrerPolicy="no-referrer"
          style={{ scale }}
          initial={{ opacity: 0, filter: "blur(12px) brightness(0.4)" }}
          animate={{ opacity: 1, filter: "blur(0px) brightness(1)" }}
          transition={{ duration: 2.6, ease: EASE }}
          className="h-full w-full object-cover object-[50%_35%]"
        />
      </motion.div>
      <div className="vignette absolute inset-0" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background to-transparent" />
      <motion.div
        style={{ y: textY, opacity }}
        className="relative z-10 flex h-full flex-col justify-end px-6 pb-14 md:px-12 md:pb-20"
      >
        <Fade delay={1.1} className="eyebrow mb-6 flex flex-wrap gap-x-8 gap-y-2">
          <span>Physics</span>
          <span>Kannur → Bremen</span>
          <span>Est. 2026 M.Sc.</span>
        </Fade>
        <h1 className="font-display text-[19vw] leading-[0.82] tracking-[-0.03em] md:text-[15vw]">
          <Line delay={0.5}>Midhun</Line>
        </h1>
        <div className="mt-6 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <Line
            delay={0.85}
            className="font-display text-2xl italic text-muted-foreground md:text-4xl"
          >
            Vadakkey Purayil
          </Line>
          <Fade delay={1.3} className="max-w-sm text-sm leading-relaxed text-foreground/80">
            I study physics. Mostly I want to know how the air above us actually works — and I
            write code to find out.
          </Fade>
        </div>
      </motion.div>
    </section>
  );
}

const interests = [
  "Atmospheric physics",
  "Carbon cycle",
  "Remote sensing",
  "Numerical modelling",
  "Python",
  "Earth observation",
  "Radiation",
  "Visualisation",
];

function Marquee() {
  const row = [...interests, ...interests];
  return (
    <div className="overflow-hidden border-y py-5">
      <div className="marquee flex w-max gap-12 whitespace-nowrap font-display text-3xl italic text-muted-foreground md:text-5xl">
        {row.map((t, i) => (
          <span key={i} className="flex items-center gap-12">
            {t}
            <span className="text-primary not-italic">✳</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function About() {
  return (
    <section id="about" className="grid gap-12 px-6 py-32 md:grid-cols-12 md:px-12 md:py-44">
      <div className="eyebrow md:col-span-3">01 — About</div>
      <div className="md:col-span-9">
        <h2 className="font-display text-4xl leading-[1.05] md:text-7xl">
          <Line>I grew up in Kerala, where the</Line>
          <Line delay={0.08}>
            monsoon is something you <em className="text-primary">feel</em>,
          </Line>
          <Line delay={0.16}>not something you read about.</Line>
        </h2>
        <div className="mt-16 grid gap-10 md:grid-cols-2">
          <Fade className="text-lg leading-relaxed text-foreground/80">
            That's probably where it started. I did my B.Sc. in Physics at Kannur University,
            spent a few months building sensor hardware in an R&D lab, and somewhere along the way
            realised the thing I enjoy most is turning physics into code and watching it run.
          </Fade>
          <Fade delay={0.15} className="text-lg leading-relaxed text-foreground/80">
            In 2026 I'm moving to Germany for an M.Sc. in Physics at the University of Bremen. I'd
            like to end up somewhere between computation and climate — atmospheric processes, the
            carbon cycle, satellite data. Still figuring out exactly where.
          </Fade>
        </div>
      </div>
    </section>
  );
}

function FullBleed() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const s = useSpring(scrollYProgress, { stiffness: 60, damping: 25 });
  const scale = useTransform(s, [0, 1], [1.25, 1]);
  const inset = useTransform(s, [0, 0.45], ["12%", "0%"]);
  const clip = useTransform(inset, (v) => `inset(${v} ${v} ${v} ${v})`);
  return (
    <div ref={ref} className="relative h-[90vh] overflow-hidden">
      <motion.div style={{ clipPath: clip }} className="absolute inset-0">
        <motion.img
          src={atmosphere}
          alt="Storm clouds over the ocean at sunset"
          loading="lazy"
          referrerPolicy="no-referrer"
          style={{ scale }}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
        <p className="absolute bottom-10 left-6 max-w-xl font-display text-3xl leading-tight md:left-12 md:text-5xl">
          Most of the weather happens in the bottom twelve kilometres.
        </p>
      </motion.div>
    </div>
  );
}

const projects = [
  {
    n: "A",
    title: "A solar system you can fly through",
    meta: "Python · PyVista · ongoing",
    body: "Around 4,000 lines of Python that render the planets and more than 200 of their moons in 3D. Started as a weekend experiment; it kept growing. Repository and screenshots coming soon.",
    img: earth,
    alt: "Earth from orbit",
  },
  {
    n: "B",
    title: "How much lead does it take?",
    meta: "B.Sc. thesis · Cs-137 · Geiger–Müller",
    body: "I pointed a Cs-137 source at a GM counter and stacked aluminium, copper and lead in between, plate by plate, to measure linear attenuation coefficients. A lot of counting. Lead wins, as expected — but the numbers were the fun part.",
    img: lab,
    alt: "Geiger–Müller tube and absorber plates on a lab bench",
  },
  {
    n: "C",
    title: "Sensors, solder and small robots",
    meta: "FLP Labs / MEC Robotics · 2024",
    body: "Four months of microcontrollers, sensors and prototypes that didn't work until they did. Also: a gas and smoke detector with motion alerts (first prize) and a nurse-assist robot (runner-up).",
    img: electronics,
    alt: "Microcontroller board wired to sensors, robot chassis behind",
  },
];

function Projects() {
  return (
    <section id="projects" className="px-6 py-32 md:px-12 md:py-44">
      <div className="mb-20 flex items-end justify-between border-b pb-6">
        <h2 className="font-display text-5xl md:text-8xl">
          <Line>Work</Line>
        </h2>
        <span className="eyebrow">02 — Selected</span>
      </div>
      <div className="space-y-32 md:space-y-48">
        {projects.map((p, i) => (
          <article
            key={p.n}
            className={`grid items-center gap-10 md:grid-cols-12 ${
              i % 2 ? "md:[&>*:first-child]:order-2" : ""
            }`}
          >
            <Photo src={p.img} alt={p.alt} className="md:col-span-7" />
            <div className="md:col-span-5 md:px-6">
              <Fade className="eyebrow mb-6 flex gap-4">
                <span className="text-primary">{p.n}</span>
                {p.meta}
              </Fade>
              <h3 className="font-display text-4xl leading-[1.02] md:text-5xl">
                <Line>{p.title}</Line>
              </h3>
              <Fade delay={0.15} className="mt-6 leading-relaxed text-foreground/75">
                {p.body}
              </Fade>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

const journey = [
  { when: "2021–24", what: "B.Sc. Physics", where: "Kannur University, Kerala" },
  { when: "Jan–Apr 2024", what: "R&D intern", where: "FLP Labs / MEC Robotics" },
  { when: "2026 →", what: "M.Sc. Physics", where: "Universität Bremen, Germany" },
];

function Journey() {
  return (
    <section id="journey" className="px-6 py-32 md:px-12">
      <div className="eyebrow mb-12">03 — So far</div>
      <ul>
        {journey.map((j, i) => (
          <motion.li
            key={j.what}
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 1.1, delay: i * 0.1, ease: EASE }}
            className="group grid grid-cols-12 items-baseline gap-4 border-t py-8 transition-colors duration-500 hover:bg-card md:py-10"
          >
            <span className="col-span-12 font-mono text-sm tabular-nums text-muted-foreground md:col-span-3">
              {j.when}
            </span>
            <span className="col-span-12 font-display text-4xl transition-transform duration-700 group-hover:translate-x-3 md:col-span-5 md:text-6xl">
              {j.what}
            </span>
            <span className="col-span-12 text-muted-foreground md:col-span-4 md:text-right">
              {j.where}
            </span>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

function Contact() {
  // Fill these in when ready — empty values stay hidden, no fake links.
  const links = [
    { label: "Email", href: "" },
    { label: "GitHub", href: "" },
    { label: "LinkedIn", href: "" },
    { label: "CV", href: "" },
  ].filter((l) => l.href);

  return (
    <section id="contact" className="px-6 pb-12 pt-40 md:px-12">
      <div className="eyebrow mb-8">05 — Say hello</div>
      <h2 className="font-display text-[12vw] leading-[0.88] tracking-[-0.03em]">
        <Line>Still exploring.</Line>
        <Line delay={0.1}>
          <em className="text-primary">Still learning.</em>
        </Line>
      </h2>
      <Fade className="mt-12 max-w-md text-foreground/75">
        I'm building up the physics, the code and the patience that environmental research needs.
        If you're working on something in that space — in Bremen or anywhere — I'd love to hear
        about it.
      </Fade>
      {links.length > 0 && (
        <div className="mt-10 flex flex-wrap gap-8 font-mono text-sm uppercase tracking-widest">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="border-b border-primary/40 pb-1 transition-colors hover:text-primary"
            >
              {l.label}
            </a>
          ))}
        </div>
      )}
      <a
        href="#top"
        className="eyebrow mt-16 inline-block whitespace-nowrap transition-colors hover:text-primary"
      >
        ↑ Back to the beginning
      </a>
      <footer className="mt-24 flex flex-col justify-between gap-4 border-t pt-6 font-mono text-xs text-muted-foreground md:flex-row md:items-center">
        <span>© 2026 Midhun Vadakkey Purayil</span>
        <div className="flex flex-wrap items-center gap-6">
          <a
            href="/midhun-portfolio-updated.zip"
            download="midhun-portfolio-updated.zip"
            className="whitespace-nowrap border-b border-primary/40 pb-0.5 text-foreground/85 transition-colors hover:border-primary hover:text-primary"
          >
            ↓ Download updated project (.zip)
          </a>
          <span>Kannur · Bremen</span>
        </div>
      </footer>
    </section>
  );
}

function SaturnNote() {
  return (
    <section className="flex min-h-[110vh] items-center px-6 md:px-12">
      <div className="max-w-lg">
        <div className="eyebrow mb-6">Interlude — rendered live</div>
        <h2 className="font-display text-5xl leading-[1.02] md:text-7xl">
          <Line>I like seeing</Line>
          <Line delay={0.08}>
            physics <em className="text-primary">move.</em>
          </Line>
        </h2>
        <Fade delay={0.2} className="mt-8 leading-relaxed text-foreground/75">
          That Saturn drifting past isn't a picture — it's being drawn in your browser right now,
          rings and all. Same instinct behind my solar system project: equations are easier to
          trust when you can watch them.
        </Fade>
      </div>
    </section>
  );
}

function Home() {
  return (
    <section className="relative overflow-hidden px-6 py-40 md:px-12">
      <div className="grid gap-12 md:grid-cols-12">
        <div className="eyebrow md:col-span-3">04 — Where this is going</div>
        <div className="md:col-span-9">
          <h2 className="font-display text-5xl leading-[1.02] md:text-8xl">
            <Line>Understanding the</Line>
            <Line delay={0.08}>
              planet we call <em className="text-accent">home.</em>
            </Line>
          </h2>
          <Fade delay={0.2} className="mt-10 max-w-xl text-lg leading-relaxed text-foreground/75">
            Long term, I want to be useful to climate and environmental research — modelling, Earth
            observation, the slow work of understanding how the atmosphere and carbon cycle behave.
            I'm not an expert in any of it yet. That's what Bremen is for.
          </Fade>
          <div className="mt-20 border-t pt-8">
            <div className="eyebrow mb-6">Recognition</div>
            <ul className="space-y-4 font-display text-2xl md:text-3xl">
              <Fade>
                <li>
                  <span className="text-primary">1st prize</span> — gas &amp; smoke detector with
                  motion alert
                </li>
              </Fade>
              <Fade delay={0.1}>
                <li>
                  <span className="text-primary">1st runner-up</span> — Nurse Bot
                </li>
              </Fade>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Progress({ paused, onToggle }: { paused: boolean; onToggle: () => void }) {
  const { scrollYProgress } = useScroll();
  const sx = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  return (
    <>
      <motion.div
        style={{ scaleX: sx }}
        className="fixed left-0 top-0 z-50 h-px w-full origin-left bg-primary"
      />
      <button
        type="button"
        onClick={onToggle}
        className="eyebrow fixed bottom-5 right-5 z-50 shrink-0 whitespace-nowrap rounded-sm border bg-background/85 px-3 py-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {paused ? "▶ Play motion" : "❚❚ Pause motion"}
      </button>
    </>
  );
}

function Nav() {
  return (
    <motion.nav
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 1.2, delay: 1.4, ease: EASE }}
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-8 px-6 py-5 mix-blend-difference md:px-12"
    >
      <a href="#top" className="shrink-0 whitespace-nowrap font-display text-2xl text-paper">
        Midhun
      </a>
      <div className="flex items-center gap-6 font-mono text-xs uppercase tracking-widest text-paper">
        {["about", "projects", "journey", "contact"].map((s) => (
          <a
            key={s}
            href={`#${s}`}
            className="hidden shrink-0 whitespace-nowrap opacity-70 transition-opacity hover:opacity-100 sm:inline"
          >
            {s}
          </a>
        ))}
      </div>
    </motion.nav>
  );
}

function EventHorizonSequence() {
  return (
    <div aria-label="Relativistic black hole, bent spacetime wormhole, and emergence" className="relative">
      {/* Stage 1: Relativistic approach & plunge into the Black Hole */}
      <section className="flex min-h-[125vh] items-end px-6 pb-24 md:px-12">
        <Fade className="max-w-sm">
          <div className="eyebrow mb-3">r → rₛ · Event Horizon</div>
          <p className="font-display text-3xl leading-tight text-foreground/90 md:text-4xl">
            Where gravity bends light back on <em className="text-primary">itself.</em>
          </p>
        </Fade>
      </section>

      {/* Stage 2: Extended wormhole — dark space continuously curving along a long 3D throat */}
      <section className="flex min-h-[340vh] items-center justify-end px-6 md:px-12">
        <Fade className="max-w-xs text-right">
          <div className="eyebrow mb-3">ds² = −c²dt² + dl² + (b₀² + l²)dΩ²</div>
          <p className="font-display text-2xl italic text-muted-foreground md:text-3xl">
            No light, only space itself bending along the throat.
          </p>
        </Fade>
      </section>

      {/* Stage 3: Opening out of the spatial bend into the other universe */}
      <section className="flex min-h-[130vh] items-end px-6 pb-20 md:px-12">
        <Fade className="max-w-md">
          <div className="eyebrow mb-3">l &gt; 0 · Other Side</div>
          <p className="font-display text-3xl leading-tight text-foreground/90 md:text-5xl">
            Opening out into <em className="text-accent">another sky.</em>
          </p>
        </Fade>
      </section>
    </div>
  );
}

export default function App() {
  useSmoothScroll();
  const [paused, setPaused] = useState(false);
  return (
    <main id="top" className="relative">
      <Suspense fallback={null}>
        <Cosmos paused={paused} />
      </Suspense>
      <div className="grain" aria-hidden />
      <Progress paused={paused} onToggle={() => setPaused((v) => !v)} />
      <Nav />
      <div className="relative z-10">
        <Hero />
        <Marquee />
        <About />
        <FullBleed />
        <SaturnNote />
        <Projects />
        <Journey />
        <Home />
        <EventHorizonSequence />
        <Contact />
      </div>
    </main>
  );
}
