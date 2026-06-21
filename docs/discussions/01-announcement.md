<!-- Category: 📣 Announcements · Pin this -->

# TinkerQuarry: describe a part in plain words, print it — all on your machine

Hi all 👋

TinkerQuarry is a local-first, AI-native app for making real, printable things. You **describe** a
part — *"a desk cable clip for an 8 mm cable"* — and it designs the shape, **checks that it will
actually print** on your printer, and hands you a ready-to-print file. You can also start from a
**photo** or a **sketch**.

Everything runs on your own computer. No account, no cloud by default — your prompts, images, and
designs stay on your machine.

### What makes it different

- **Plain words in, printable file out.** No CAD to learn — you don't draw anything.
- **It checks before it prints.** A *printability gate* validates every part against your printer's
  build volume and capabilities. A part that won't print is **blocked and explained**, not handed to
  you to discover at the nozzle.
- **Genuinely local.** The AI runs on-device. It even sets itself up on first run and self-heals if
  the AI is interrupted — no "go install this yourself."

### A real run (laptop-class machine, no GPU)

```
$ tinkerquarry design "a desk cable clip for an 8 mm cable" --slice
Gate: PASS · 16 × 27 × 10 mm · watertight · Readiness 92/100
Slice: 17,034 G-code lines → part.gcode.3mf (~6m58s, 50 layers)
```

Words → print-ready G-code, on your machine.

### Where it's at

The full pipeline (describe → AI plan → geometry → printability gate → slice → G-code) is proven
end-to-end, and the project passes its adversarial release gate (**CLEAR TO ADVANCE**: 0 blockers,
new users reach the core feature). The one step left to you is plugging in a physical printer.

### Get involved

- New here? Read the **[FAQ](02-faq.md)** and the **[Manual](../MANUAL.md)**.
- Printed something? Post it in **[Show & Tell](03-show-and-tell.md)**.
- Have an idea or a wish? **[Roadmap & ideas](04-roadmap-and-ideas.md)**.
- Stuck? **[Getting started / troubleshooting](05-getting-started-help.md)**.

Welcome to the quarry. Let's make things. ⛏️🧱
