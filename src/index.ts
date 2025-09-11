import { Game, InteractionEnum_ENUM, MapObject, WireObject, PlayerMoves } from "@gathertown/gather-game-client";
import { nanoid } from "nanoid";
global.WebSocket = require("isomorphic-ws");

// replace with your spaceId, that you can edit
const SPACE_ID = "k1s3wHMOVDoLHVCo\\fstest";
const N = 150;
const MAP_ID = "forest-v1";
const REGROW_PROB = 0.05;
const REGROW_MS = 5000;
const INNER_RADIUS = 25;
const OUTER_RADIUS = 600;

const game = new Game(SPACE_ID, () => Promise.resolve({ apiKey: process.env.GATHER_API_KEY ?? "" }));
game.connect();
game.subscribeToConnection((connected) => console.log("connected?", connected));

type Procedure<T extends unknown[]> = (...args: T) => void;

const debounce = <T extends unknown[]>(
  fn: (...args: T) => void,
  delay: number
) => {
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastArgs: T | null = null;
  let hasNewValue = false;

  const start = () => {
    if (!timer) {
      timer = setInterval(() => {
        if (hasNewValue && lastArgs !== null) {
          fn(...lastArgs);
          hasNewValue = false; // reset after emitting
        } else {
          // No new data → stop ticker automatically
          clearInterval(timer!);
          timer = null;
        }
      }, delay);
    }
  };

  return (...args: T) => {
    lastArgs = args;
    hasNewValue = true;
    start(); // start ticker if not running
  };
}

game.waitForInit().then(() => {
  const pets = new Set<string>();
  const me = game.getMyPlayer();
  let pf;
  // isPet :: MapObject -> Bool
  const isPet = (obj: MapObject | WireObject) => obj.objectPlacerId === me.id && obj._tags?.includes('pet-mon');

  const createPet = () => {
    game.addObject(me.map, {
      _tags: ['pet-mon'],
      _name: 'Pet',
      id: 'PET_' + nanoid(),
      type: InteractionEnum_ENUM.EXTENSION,
      x: me.x,
      y: me.y,
      width: 1,
      height: 1,
      normal: "https://cdn.gather.town/v0/b/gather-town.appspot.com/o/manually-uploaded%2Ftree-green.png?alt=media&token=b92b7d03-1f03-40f9-88f5-8dc683b6590e",
      previewMessage: 'Press x to pet',
      distThreshold: 1,
      properties: {
        petType: 'custom',
      },
    });
  }
  const deletePet = () => {
    game.getKnownCompletedMaps().forEach(map => {
      Object
        .entries(game.partialMaps[map].objects ?? {})
        .filter(([_, obj]) => isPet(obj))
        .forEach(([key, obj]) => {
          console.log("cleaning up old object", key);
          game.deleteObjectByKey(map, key);
        });
    });
  }

  const handleMove = debounce((playerMoves: PlayerMoves) => {
    console.log("player", playerMoves);

    if (playerMoves.mapId) {
      console.log("player moved to a new map");

      // clean up the old ones
      deletePet();
      // spawn a new pet every time
      createPet();
    }

    pets.forEach(key => {
      game.moveMapObject(me.map, key, {
        x: playerMoves.x ?? 0,
        y: playerMoves.y ?? 0,
        xOffset: 0,
        yOffset: 0,
      }, 1000, "Linear");
    });
  }, 500);

  // claim pets by storing them in a set
  game.subscribeToEvent("mapSetObjectsV2", ({ mapSetObjectsV2 }) => {
    Object.values(mapSetObjectsV2.objects)
      .filter(isPet)
      .filter(obj => obj.id)
      .forEach(obj => {
        console.log("found a pet!", obj.id);

        pets.add(obj.id!);
      });
  }, ({ mapSetObjectsV2 }) => {
    return Object.values(mapSetObjectsV2.objects).some(isPet);
  });

  // Move pets around if the player moves
  game.subscribeToEvent("playerMoves", ({ playerMoves }) => {
    handleMove(playerMoves);
  }, ({ playerMoves }) => {
    return game.getPlayerUidFromEncId(playerMoves.encId) === me.id;
  });

  game.subscribeToEvent("playerInteractsWithObject", ({ playerInteractsWithObject }) => {
    console.log(game?.partialMaps[playerInteractsWithObject.mapId]?.objects?.[playerInteractsWithObject.key]);
  });

  // clean up the old ones
  deletePet();
  // spawn a new pet every time
  createPet();
});
