![Group 21](https://github.com/binayshaw7777/Kotfolio/assets/62587060/da8002a1-fceb-4ded-bf53-eef944dd138a)

# Kotfolio

Kotfolio is a minimalistic and clean portfolio project built with [Kobweb](https://github.com/varabyte/kobweb), a Compose HTML framework for Kotlin multi-platform. The design is inspired by product designers, showcasing a sleek black color scheme.

## [Try Kotfolio](https://kotfolio.onrender.com/)

<p align="center">
  <img alt="Kotlin" src="https://img.shields.io/badge/Kotlin-a503fc?logo=kotlin&logoColor=white&style=for-the-badge"/></a>
  <img alt="Jetpack Compose" src="https://img.shields.io/static/v1?style=for-the-badge&message=Jetpack+Compose&color=4285F4&logo=Jetpack+Compose&logoColor=FFFFFF&label="/></a> 
  <a href="https://hits.sh/github.com/binayshaw7777/Kotfolio/"><img alt="Hits" src="https://hits.sh/github.com/binayshaw7777/Kotfolio.svg?style=for-the-badge&label=Views&extraCount=10&color=54856b"/></a>
</p>

## Features

- **Minimal Design:** Keep it simple, yet elegant, to highlight your work.
- **Responsive:** Ensures a seamless experience across various devices.
- **Kotlin Multi-Platform:** Leverages the power of Kotlin for both front-end and back-end development.


## Jelly Drift 3D

Kotfolio includes an integrated WebGL racing game at the `/drift` route. Built with a custom JavaScript 3D engine (Three.js) and orchestrated through Kobweb's Compose HTML bridge, it features creative Google AdSense placements woven into the gameplay experience.

### Gameplay
- **4 Cars**: `jelly_gt`, `tofu_86`, `bumble_buggy`, `cobalt_hyper` — each with unique stats (top speed, acceleration, drift factor, bounce)
- **3 Tracks**: Circuit layouts with trackside billboards and gantry anchors for dynamic ad placement
- **2 Modes**: 
  - *Drift Rush* — Time-trial drifting challenges
  - *Grand Prix* — Multi-lap racing against AI opponents

### Controls
| Input | Action |
|-------|--------|
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake/Reverse |
| `A` / `←` | Steer Left |
| `D` / `→` | Steer Right |
| `Space` | Handbrake Drift |
| `C` | Toggle Camera (3rd-person / Hood) |
| `V` | Toggle Hood View |
| `Esc` | Pause Menu |

### Creative Ad Placements
The game integrates Google AdSense through multiple contextual placements:
- **Driver Center-Console Ad**: In-car dashboard display visible during gameplay
- **3rd-Person Moving Roof Ad**: Billboard mounted on the car's roof, visible in chase camera
- **Watch-an-Ad-to-Continue**: Interstitial ad between laps/sessions
- **Trackside Billboards**: Dynamic 3D meshes along track boundaries (`billboardMeshes`)
- **Garage & Podium Banners**: Static banners in menu screens

### Ad Testing Overrides
For local development and E2E testing, use URL query parameters:
```bash
/drift?adtest=on                    # Force test ads from Google
/drift?adslot_console=<slot_id>     # Override console ad slot
/drift?adslot_roof=<slot_id>        # Override roof ad slot
/drift?adslot_billboard=<slot_id>   # Override billboard ad slots
```

### Local Run & Test Commands
```bash
# Start dev server with game
cd site && kobweb run
# Open http://localhost:8080/drift in browser

# Static export (for E2E testing)
./gradlew :site:kobwebExport
# Exported to site/.kobweb/site/

# Run full E2E test suite (Headless Chrome CDP)
python e2e/run_e2e.py --tier all --workers 2
```

## Tech Stack

- **[Kobweb](https://github.com/varabyte/kobweb):** Compose HTML framework for Kotlin multi-platform.
- **[Jetpack Compose](https://developer.android.com/jetpack/compose):** Modern Android UI toolkit for building native UIs in a declarative way.
- **[Kotlin](https://kotlinlang.org/):** Modern programming language for concise and expressive code.


## Previews: 
![Kotffolio Preview](https://github.com/binayshaw7777/Kotfolio/assets/62587060/78a76148-318e-42c3-96c3-782565dc7a92)

## Mockups
![1](https://github.com/binayshaw7777/Kotfolio/assets/62587060/0e9eb36b-8a9a-4036-82a3-4fccd67c5a83)
![Free Premium Black 3D Device Website Mockup](https://github.com/binayshaw7777/Kotfolio/assets/62587060/9ac5f3a9-fa9e-4093-b45c-396f28811445)
![2](https://github.com/binayshaw7777/Kotfolio/assets/62587060/fd81d615-37ac-4dd7-a98e-0cc9e8e6684f)



## Getting Started

Follow these steps to set up Kotfolio locally:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/kotfolio.git
   ```

2. **Getting Started**

    First, run the development server by typing the following command in a terminal under the `site` folder:

    ```bash
    $ cd site
    $ kobweb run
    ```

    Open [http://localhost:8080](http://localhost:8080) with your browser to see the result.

You can use any editor you want for the project, but we recommend using **IntelliJ IDEA Community Edition** downloaded
using the [Toolbox App](https://www.jetbrains.com/toolbox-app/).

Press `Q` in the terminal to gracefully stop the server.

---

<br>

[![Star History Chart](https://api.star-history.com/svg?repos=binayshaw7777/Kotfolio&type=Date)](https://star-history.com/#binayshaw7777/Kotfolio&Date)

<br>
