# GatherTown Pet

This is a small [GatherTown](https://gather.town) extension to create a pet that:

- can be bigger than the built-in pets
- can be caged in a ball (*sorry Nintendo, please dont ban me*)
- follows the player around

<img src="https://i.postimg.cc/mZ12kQCn/Screen-Recording-2025-09-12-at-19-09-44.gif"/>

## How to run

1. Install dependencies using `pnpm install` or `npm install`
2. Create a API key at https://gather.town/apiKeys
3. Find your space ID by copying the URL of your space. It should look like `https://app.gather.town/app/{first-part-of-space-id}/{second-part-of-space-id}`. The resulting space ID is `{first-part-of-space-id}\\{second-part-of-space-id}`
4. Set the `GATHER_API_KEY` and `GATHER_SPACE_ID` environment variables
5. Run the script using `pnpm start` or `npm start`

## Note

I am in no way affiliated with GatherTown or any of its partners.

## Credits

- Thanks to all the people who contributed to [SpriteCollab](https://sprites.pmdcollab.org/#/). These sprites can be packed
  using the [pack.ts](tools/pack.ts) tool and used as a pet in gather.town.
- Thanks to [GatherTown](https://www.npmjs.com/package/@gathertown/gather-game-client) for providing the WebSocket API
