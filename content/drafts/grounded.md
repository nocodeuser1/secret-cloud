# The grounded approach

This is what is actually possible, in what order, and with what. Everything here comes from the call, except where I say "my addition". I have been plain about the parts of the phone that will fight us.

## Phases

### Phase 0, "Prove the feeling" (2 to 3 weeks)

A web page, opened on a phone in the park in Guthrie, with five to ten of your loops placed at spots on the grass. The page reads your position with the browser's Geolocation API and plays the loops with the Web Audio API. Gain follows distance: louder as you walk in, quieter as you walk out. The screen stays on (the Screen Wake Lock API).

iOS Safari stops a web page's audio and location once the screen locks or Safari goes to the background. No setting changes this. So Phase 0 is for walking with the phone in your hand to test the idea and feel what 30 feet means on real ground. It is not the final experience.

To verify on the first walk (my addition): whether the mute switch silences Web Audio, and how long the first fix takes under trees.

Deliverable: a shareable link the group walks with.

What could go wrong: GPS under the Guthrie trees is rough enough that the loops feel random, and the radii have to grow.

### Phase 1, "The real walk" (6 to 10 weeks)

A native iOS app in Swift and SwiftUI. CoreLocation with when-in-use permission plus the background location mode, so the app keeps reading your position after you lock the phone and pocket it (iOS shows a blue indicator while it does). AVAudioEngine with the audio background mode, so the loops keep playing.

Beside it, a curator tool as a web page: a map (MapLibre with OpenStreetMap tiles, or Apple MapKit JS, free with the developer account), drop a pin, set the radius and the inner and outer level, upload the audio. The backend is Supabase: Postgres with PostGIS for "which drops are near me", Storage for audio, Auth for curators.

The app reaches the group through TestFlight. Apple expects a clear in-app reason for background location before the permission prompt, and real audio playing in the background. Battery: an hour of GPS at walking pace is fine, a whole afternoon is not.

Deliverable: a TestFlight build the group walks with, phone in pocket, plus a curator page to place drops.

What could go wrong: App Store review asks us to justify background location, and we lose a week to it.

### Phase 2, "Secret shows" (4 to 6 weeks)

Band accounts. The app generates a QR code for a show and the band posts it. Scanning opens the app if you have it, or a page that gets you to it. A show has a time window, a spot, and a radius. When your phone is inside the radius during the window, you get an arrival check-in: one tap, "I'm here". That tap unlocks the in-show screen, and later the reward, for example a recording of that set, uploaded by the band afterward. Directions to the radius hand off to Apple Maps (my addition).

Follow a band and get a push notification each month through APNs. That needs the push capability in the app and a small sender on Supabase.

Deliverable: a band can schedule a show, print the code, and the people who stood in the radius get the recording.

What could go wrong: people scan the code at home, expect the show to be in the app, and find only a time and a direction.

### Phase 3, "The cloud grows" (ongoing)

A replies and testimonies inbox for curators, where every reply waits for the curator before anyone else hears it; private to the curator is the default. Approving one is a single tap, and a curator can line up months ahead. Monthly drop scheduling: a soundscape gets a publish date, so the same park wakes up new each month without anyone tapping deploy at midnight.

A regional archive: every show adds its place and its recording, and the heat map for travelers is drawn from show locations, never from people. Then Android, a second app in Kotlin with its own rules for background location (a visible notification while it runs, and a separate Play Store review). It shares the backend, so nothing on the curator side changes.

Deliverable: a curator plans the next three months of a park from the inbox, and the first Android walker joins.

What could go wrong: the heat map starts to look like a count, and counts are what you said you do not want.

## The data model

(my addition; the names are yours)

- clouds: id, name, owner, created_at. A curator space.
- drops: id, cloud_id, soundscape_id (optional), audio_path, lat, lng, radius_m, inner_db, outer_db, kind (loop, soundscape-stem, easter-egg, spoken), title. "Spoken" is for Bible verses, prophetic words, life spoken over someone.
- soundscapes: id, cloud_id, name, perfect_lat, perfect_lng, publish_at; its stems are drops.
- shows: id, band_id, title, starts_at, ends_at, lat, lng, radius_m, qr_code, reward_path.
- checkins: id, show_id, user_id, checked_in_at. Written only when the person taps.
- replies: id, drop_id or soundscape_id, author_id, body, approved_at (empty until the curator says yes).
- follows: id, band_id, user_id, push_token, created_at.

Curators, bands, and walkers are Supabase Auth users with a profile row that says which they are.

## The audio math

Each drop has two rings: full level at the inner ring, quiet level at the outer. Between them the level slides in a straight line, in dB, so the change feels even to the ear.

For distance d from the drop, radius R, inner radius r0 (say 3 m), level L_in at r0 and L_out at R, in dB:

L(d) = L_in + (L_out - L_in) * clamp((d - r0) / (R - r0), 0, 1)

Then gain = 10^(L / 20) for the mixer. Outside R the gain is zero. Every change is smoothed over 300 to 500 ms, so a stumble in the GPS sounds like a breeze. At the edge we add hysteresis: a drop switches on when you come inside R and off only when you pass R plus a few meters, so standing on the ring does not flicker it.

GPS reality. Under trees expect 5 to 15 m of error, worse in the first 10 seconds. The phone reports its accuracy with each fix, so we widen the effective radius by that number and ignore fixes worse than about 30 m. That is why an easter egg should never be smaller than about 8 m: the stone is the story, and the phone needs a circle it can find.

Multi-stem soundscapes. Each stem is its own drop around the perfect spot. Stand there and every stem sits at its inner level, so you hear the mix as it sounds on the record, in stereo. Walk toward the rock and the violin comes up. Stereo here means the mix at the spot. It is not true 3D. All stems run together and only the gains move, so nothing drifts. Head-tracked spatial audio with AirPods is a later option, on Apple's PHASE framework.

## Realities to respect

- Background audio and location on iOS: native yes, web no.
- Android later, with a foreground service, a persistent notification, and its own store review.
- File sizes and offline. Masters stay WAV in Storage. The app downloads AAC at 128 to 192 kbps, about 1 to 1.5 MB a minute, and caches the whole park before you leave Wi-Fi, since the park may have no signal.
- Replies are moderated. A reply goes to the curator first, and no one else hears it until the curator approves it.
- Privacy. We store only what the experience needs. Location never leaves the phone except for check-ins the person taps. No location history, no analytics that follow a person.
- The phone-in-hand tension. The design answer: one tap to begin, then the screen locks and the app keeps going. The phone leads you there and gets out of the way, which is what you both said.
- App Store rules. The location and audio background modes must be used for what they say: a plain reason at the prompt, and real sound playing in the background.
- Radii must fit the ground (my addition). Thirty feet is about 9 m, inside GPS error under trees. Expect 15 to 30 m for loops; keep small radii for open ground.

## What it costs

- Apple Developer Program: 99 USD a year. Whoever owns this account owns the app, so decide that together.
- Supabase: the group already has a Pro org, and this fits in it. As a schema inside the existing project it adds nothing; its own project would add about 10 USD a month of compute, verify on the billing page.
- Domain: about 15 USD a year.
- Map tiles: free at this scale, for OpenStreetMap and MapKit JS.
- TestFlight: free.

Total under 150 USD a year before anyone is paid for time.

## What I need from you

1. Five to ten loops as WAV or high-bitrate MP3, each with a one-line note: what it is, where it wants to live, how loud at the center.
2. The park, and a rough sketch of where things go; a photo of a hand-drawn map is enough.
3. A decision on the name. If The Secret Cloud is final, I will check the App Store and the domain.
4. Who the first curator is.
5. Whether iOS-only is fine for a year, and who in the group carries Android.
6. The one Bible verse or spoken word for the first easter egg, and whose voice reads it.
7. A date to walk the park together.
8. The Apple ID the developer account should live under (my addition).

## Open questions

1. Should the public app show who made it, or only the name?
2. Should drops be on a map, or hidden so you follow your ears?
3. Should a show's reward be a recording or something physical?
4. Should the monthly drop be dated and announced, or silent?
5. Should the heat map show where shows happen, when you want no counts?
6. Should replies go to every curator in the cloud, or only the one who placed that soundscape?
7. Should the in-show screen be visuals on loop, or something quieter?
8. Should walkers need an account at all before Phase 2?
9. Should the first easter egg be heard in a voice, or read as text on the screen?
10. Should the app be free, always, with no way to pay?
