# Galaga Game

A neon retro Galaga game built with Angular 20 — shoot the alien invaders before they dive-bomb you!

## Play Now

🚀 **Play the game:** https://timothyoverton.github.io/galaga-game/

## How to Play

1. Open the game in your browser (click the link above!)
2. Press **← → arrow keys** (or **A / D**) to move your ship left and right
3. Press **SPACE** to shoot
4. Shoot all the aliens to clear the level — don't let them hit you or escape!

## Enemy Types

| Enemy | Points (Formation) | Points (Diving) | Special |
|-------|--------------------|-----------------|---------|
| ◆ Bee (orange) | 50 pts | 100 pts | Fast, lots of them |
| ◆ Butterfly (cyan) | 80 pts | 160 pts | Shoots at you while diving |
| ◆ Boss (green) | 160 pts | 400 pts | Two hits to kill — fires tractor beam! |

## Watch Out for the Tractor Beam!

When a Boss Galaga dives, it fires a **tractor beam** downward. If your ship stays inside the beam too long, you'll lose a life! Shoot the boss to cancel the beam, or move out of it quickly.

## Tips

- Enemies are worth **double points** when they're diving — let them get close, then shoot!
- The **Boss Galaga** turns orange after the first hit — one more shot to destroy it
- Enemies fly in from the sides and top at the start of each level — watch the formation build
- Each level brings **faster enemies** and more frequent dive attacks
- Enemies that dive and miss will loop back from the top to rejoin the formation

## Local Development

```bash
npm install
npm start
```

Visit http://localhost:4200/

## Build and Deploy

```bash
# Build for production
npm run build:prod

# Deploy to GitHub Pages
npm run deploy
```

---

Built with Angular 20 and deployed via GitHub Pages
