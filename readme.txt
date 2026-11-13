# VLAIQ — COMPLETE MASTER PROMPT
## Build a Premium AI-Powered Smart Parking & Green Mobility Application for UniHack 2026

### YOUR ROLE

You are acting as an elite multidisciplinary software engineering and product design team consisting of:

- Principal Full-Stack Software Engineer
- Senior React and TypeScript Developer
- Senior UI/UX and Product Designer
- GIS and Navigation Systems Engineer
- AI/ML Engineer
- Data Engineer
- Cloud and DevOps Engineer
- Accessibility Specialist
- QA and Security Engineer
- Startup Product Strategist
- Hackathon Technical Mentor

Your task is to help us design, develop, integrate, test, and deploy a production-quality prototype for a major hackathon.

We want a technically impressive, visually exceptional, genuinely useful application that can compete for first place.

**Your work must prioritize real functionality, reliability, user experience, innovation, and measurable impact rather than superficial features.**

Do not deliver a generic dashboard, a static landing page, or a collection of attractive but nonfunctional components.

We want a complete, interactive, demonstrable product.

---

# 1. HACKATHON CONTEXT

## Event

**UniHack 2026 — Timișoara, Romania**

- Dates: November 13–15, 2026
- Team name: VLAIQ
- Team size: 4 members
- Main competition: The Bloom
- Main track: Green Mobility
- Location: Timișoara, Romania
- Development window: Approximately 48 hours
- Primary objective: Compete for first place in Green Mobility
- Secondary objective: Compete in as many relevant additional challenges as we can genuinely satisfy

Our solution should be designed specifically around real urban mobility problems in Timișoara.

The municipality may provide useful public datasets, transport information, or other authorized resources during the hackathon.

Do not assume access to any dataset or system that has not been confirmed.

Verify the current hackathon rules, challenge eligibility, permitted use of existing code, AI-tool policies, and submission requirements before finalizing the implementation.

## Our Core Ambition

Build a smart mobility application that does not simply show users where parking facilities are located.

It should intelligently recommend the best way to complete an entire journey by considering:

- Parking availability or estimated occupancy
- Driving time
- Road distance
- Parking prices
- Walking distance
- Public transport connections
- Total journey duration
- Estimated environmental impact
- User preferences
- Accessibility requirements
- Dynamic changes in available information

The final product should feel like a combination of a navigation app, an intelligent parking assistant, and a green mobility platform.

---

# 2. PRODUCT IDENTITY

## Team

VLAIQ

## Working Product Name

**VLAIQ FLOW**

Tagline: **Park smarter. Move greener.**

Other names we have discussed:

- VIAIQ
- NAVORA
- SPOTIQ
- VLAIQ MOVE
- VLAIQ PULSE
- VLAIQ SHIFT

The product name is not finalized. Use VLAIQ FLOW as the temporary working name, but make branding easy to change.

Never silently replace our team identity.

## Product Vision

Create a smart urban mobility companion that reduces unnecessary driving, parking search time, traffic congestion, and avoidable emissions.

The product should help users make better decisions about how and where to park, while encouraging walking and public transport when they are genuinely better choices.

We are not trying to recreate every Waze feature.

We are building a distinctive parking-first, multimodal navigation experience.

## Target Users

1. Drivers traveling into busy city centers
2. People unfamiliar with Timișoara
3. Commuters searching for affordable parking
4. Visitors who need directions to parking facilities
5. People who want environmentally friendlier journeys
6. Users who need parking and route accessibility information
7. Local authorities interested in aggregated mobility insights

---

# 3. THE PROBLEM WE ARE SOLVING

Urban drivers frequently reach their destination but cannot immediately find suitable parking.

They may spend additional time driving around congested streets.

This causes:

- Wasted time
- Additional fuel or energy consumption
- Increased traffic congestion
- Frustration
- More vehicle emissions
- Unnecessary travel through city centers
- Poor parking space utilization

Traditional navigation applications focus primarily on taking users to their destination.

We want to solve the additional problem of finding the most suitable parking option and completing the journey efficiently.

## Our Differentiator

**We optimize the entire journey, not just the road route.**

For example:

A driver wants to visit Piața Victoriei in Timișoara.

Instead of automatically navigating to the nearest parking facility, the system might discover that:

- Parking A is close but potentially difficult to find a space in.
- Parking B is slightly farther away but provides a better expected total journey time.
- Parking C is cheaper and connected to convenient public transport.
- A park-and-ride alternative could reduce driving through the central area.

The application compares these options and presents intelligent recommendations.

---

# 4. PRODUCT FORMAT

Build a **Progressive Web Application (PWA)**.

It must:

- Work on Android phones
- Work on iPhones through Safari
- Work on desktop and laptop browsers
- Be responsive
- Be accessible through a public HTTPS URL
- Support installation on compatible devices
- Be usable without downloading an application from an app store
- Support GPS location when permission is granted
- Provide a polished touch-first experience
- Support a demo mode without requiring user registration
- Be distributable using a QR code

This must be a real interactive web application, not merely a website presenting the product idea.

## Preferred Stack

Frontend:
- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Lucide icons
- Framer Motion or Motion for selected transitions

Maps:
- MapLibre GL JS
- OpenStreetMap-compatible geographic data
- Legally permitted vector map tiles

Routing:
- Valhalla, GraphHopper, openrouteservice, OSRM, or another compatible routing provider
- Choose based on API capability, license, quota, availability, and implementation complexity

Backend:
- Node.js
- TypeScript
- Express or Fastify

Database:
- PostgreSQL
- Tiger Data / Timescale capabilities if available and appropriate

Authentication:
- Auth0 as an optional integration

AI:
- Google Gemini API

Voice:
- Browser Web Speech API
- ElevenLabs API as an optional enhanced experience

Deployment:
- Vercel for frontend
- Vultr or another suitable host for backend

Testing:
- Vitest
- React Testing Library
- Playwright
- Mobile browser testing

Do not introduce unnecessary frameworks.

Maintain a clean architecture that can be understood and extended by a four-person student team.

---

# 5. COMPLETE APPLICATION EXPERIENCE

## 5.1 Opening the Application

The user opens VLAIQ FLOW.

They should immediately see a premium interactive map focused on Timișoara.

The interface should include:

- Product logo
- Destination search bar
- Current location control
- Interactive city map
- Nearby parking indicators
- Navigation button
- Voice assistant button
- User preferences
- Explore and Navigation modes

The application should not begin with a long marketing landing page.

Users should reach the useful product immediately.

A small introduction or optional onboarding overlay is acceptable.

## 5.2 Location Permission

When appropriate, request permission to access the device's location.

If permission is granted:

- Show the user's current GPS position.
- Display a location marker or navigation arrow.
- Update the marker using the Geolocation API.
- Allow the map to follow the user's position.
- Allow manual map movement.
- Provide a button to return the camera to the current position.

If permission is denied:

- Continue operating.
- Allow the user to choose a starting location manually.
- Never prevent access to core features.

Handle inaccurate GPS readings.

Do not claim centimeter-level positioning.

## 5.3 Destination Search

Users should be able to search for:

- Streets
- Addresses
- Landmarks
- Tourist destinations
- Public institutions
- Areas of Timișoara
- Known destinations

Potential sample destinations:

- Piața Victoriei
- Piața Unirii
- Iulius Town
- Timișoara city center

Use a real geocoding service subject to its terms.

Provide autocomplete suggestions when supported.

Display the destination on the map.

## 5.4 Parking Discovery

After selecting a destination, display nearby parking facilities.

Every parking facility should have:

- Name
- Coordinates
- Address when available
- Parking type
- Capacity when known
- Number of free spaces only when supported by reliable data
- Estimated availability when justified
- Parking price when verified
- Distance to destination
- Estimated walking time
- Navigation option
- Data source
- Last update time where relevant
- Confidence or data quality status

Clearly distinguish between:

1. Confirmed availability
2. Estimated availability
3. Unknown availability
4. Simulated demo availability

Never invent real parking spaces, prices, occupancy statistics, or sensor readings.

Use verified geographic locations.

Do not equate a parking location being listed with it having an available space.

## 5.5 Three Recommendation Modes

Implement three primary modes:

### FASTEST

Find the option with the lowest expected total journey duration.

Consider:

- Driving duration
- Expected parking search time, if supportable
- Walking duration
- Public transport waiting time
- Public transport duration
- Transfers where relevant

### CHEAPEST

Find the most cost-effective option.

Consider:

- Parking cost for the selected duration
- Public transport fares, where verified
- Possible driving cost estimates when justified
- Unknown prices explicitly

Do not display fabricated costs as facts.

### GREENEST

Find the more environmentally responsible practical alternative.

Consider:

- Driving distance
- Potential avoided driving distance
- Walking
- Public transport
- Estimated vehicle emissions using transparent assumptions
- Travel feasibility

Do not assume that the option requiring the least driving is always optimal under every environmental condition.

Allow users to compare all three modes.

## 5.6 Parking Recommendation Cards

Show visually refined cards containing:

- Parking name
- Total estimated time
- Driving time
- Walking time
- Transit duration, if any
- Estimated parking cost
- Availability status
- Confidence level
- Environmental comparison when valid
- Recommendation explanation
- Start Navigation action

Make the best recommendation visually clear.

Avoid clutter.

## 5.7 Parking Details

When a user selects a parking location, open a detailed panel.

Include:

- Parking information
- Location
- Verified price information
- Availability status
- Estimated arrival time
- Walking directions to the final destination
- Available accessibility information
- Report issue action
- Navigate action

If information is unavailable, display "Unknown" or "Not available".

---

# 6. WAZE-LIKE NAVIGATION

This is one of our most important features.

We want the user to see a vehicle-position marker moving along the route on the map.

## 6.1 Navigation Map

Use MapLibre GL JS.

Provide:

- A highlighted road route
- User or vehicle position marker
- Current movement direction
- Map camera following the marker
- Adjustable zoom
- Optional camera bearing and pitch
- Remaining distance
- Estimated arrival time
- Route progress
- Next-turn information when supported
- Navigation start and stop controls

Use actual road geometry returned by the routing service.

Never display a straight line between points and present it as a valid driving route.

## 6.2 Live GPS Navigation

Use `navigator.geolocation.watchPosition()` when the user grants permission.

The navigation marker should update as location information changes.

Use geolocation heading when available and reliable.

Handle:

- Low GPS accuracy
- Missing heading
- Slow updates
- Temporary location loss
- Incorrect GPS jumps
- Route deviation

Avoid excessive network calls and unnecessary rerouting.

Use simple map matching or route proximity checks if appropriate.

Clearly explain that the hackathon PWA is a prototype and may not support reliable background navigation or lock-screen operation.

Do not present the prototype as a safety-certified driving navigation system.

## 6.3 Navigation Demo Simulation

This feature is mandatory for the hackathon.

Create a clearly labeled **Demo Simulation Mode**.

The judges should be able to watch a virtual car move along a real mapped route without physically driving through Timișoara.

Requirements:

- Start simulation
- Pause simulation
- Resume simulation
- Reset simulation
- Adjustable simulation speed if feasible
- Smooth movement along road geometry
- Vehicle orientation following the road
- Live route progress
- Updated remaining distance
- Updated ETA estimate
- Map following the vehicle

Simulation must be distinguishable from actual GPS navigation.

## 6.4 Intelligent Rerouting

When a selected parking facility becomes unavailable, the system should:

1. Detect the updated availability data.
2. Reevaluate suitable alternatives.
3. Identify whether a better option exists.
4. Notify the user.
5. Explain the change.
6. Request confirmation when appropriate.
7. Recalculate the route.
8. Display the updated navigation path.

For the hackathon, demonstrate this using an explicitly simulated occupancy change.

Example:

Parking A was recommended.

Its demo occupancy changes to full.

The system recommends Parking B.

The route changes after the user accepts.

This scenario should be exceptionally polished.

## 6.5 Driving-to-Walking Transition

One of our key product differentiators.

After reaching the selected parking facility:

- End driving navigation.
- Display a parking arrival confirmation.
- Offer walking directions to the original destination.
- Switch to pedestrian routing.
- Display walking time and distance.
- Keep the original destination visible.

If the user selected a public transport option, show the walking connection to the transit stop and subsequent route segments.

---

# 7. VLAIQ SMARTMATCH — RECOMMENDATION ENGINE

Develop our own deterministic recommendation algorithm.

Gemini should not invent route recommendations or calculate arbitrary numerical values.

Our application should calculate the routes and ranking from structured data.

## 7.1 Journey Model

For each candidate parking facility:

Total journey time =

Driving time  
+ Expected parking search time  
+ Walking time  
+ Transit waiting time  
+ Transit travel time  
+ Transfer penalties where applicable

Not every term applies to every journey.

Avoid double-counting route segments.

Only estimate parking search time if we have a defensible model and suitable data.

If this is not available, label the estimate as a demo assumption or omit it.

## 7.2 Scoring

Create a transparent weighted scoring system.

Potential criteria:

- Total journey time
- Parking availability
- Parking cost
- Environmental impact
- Walking distance
- Accessibility constraints
- Data reliability

Normalize criteria to comparable scales.

Treat unavailable data as unknown rather than inventing neutral values without explanation.

Use filters for hard user constraints.

Example constraints:

- Maximum walking time: 5 minutes
- Maximum parking cost: 10 RON
- Accessibility parking required
- Avoid public transport
- Prefer public transport
- Minimize driving distance

The weighting should adapt to Fastest, Cheapest, and Greenest modes.

## 7.3 Arrival-Time-Aware Recommendations

If sufficient data exists, estimate availability at the user's expected arrival time.

For example:

A parking facility may have available spaces now but could become more crowded before the driver arrives.

This predictive feature is optional and must never pretend to be supported by historical data we do not have.

## 7.4 Explainability

For every recommended option, explain the reasoning.

Example:

"Parking B is recommended because the combined driving and walking journey is expected to be shorter than Parking A."

Only reference verified or explicitly estimated information.

Provide the underlying comparison values.

---

# 8. REAL DATA AND DEMO DATA

Data integrity is extremely important.

We may receive transportation or parking-related datasets from Timișoara municipality or other authorized providers.

Possible sources to investigate:

- Timișoara Open Data portal: https://data.primariatm.ro/dataset/
- SMTT public transport data
- GTFS schedules
- OpenStreetMap
- Authorized parking operator data
- Authorized traffic or parking camera integrations

Verify availability, licenses, freshness, and technical compatibility.

Do not assume GTFS schedules are real-time arrival data.

## 8.1 Source Provenance

Each parking occupancy record should include:

- Parking identifier
- Timestamp
- Occupancy or free-space count, if known
- Source
- Real / Estimated / Simulated classification
- Confidence score when justified

## 8.2 Graceful Fallback

The application must work even if no live parking occupancy API is available.

Implement:

- Verified parking locations
- Demo occupancy dataset
- Controlled simulation events
- Clear demo labels
- Deterministic recommendation engine
- Working map
- Working route calculation
- Working navigation simulation

Never disguise simulated results as actual real-time city data.

---

# 9. OPTIONAL CAMERA-BASED PARKING DETECTION

We have discussed using computer vision to detect empty parking spots from city cameras.

However, we have not confirmed access to municipal camera feeds.

The core application must not depend on this integration.

## Future / Optional Computer Vision Module

If authorized video or suitable test images become available:

- Identify visible parking areas.
- Define parking slot regions.
- Detect vehicles.
- Determine likely occupied or unoccupied spaces.
- Account for camera angles and occlusions.
- Update the availability estimate.
- Send only necessary parking occupancy information to the application.

Possible approach:

- Python
- OpenCV
- YOLO-based object detection
- Polygon-based parking slot occupancy checks

Privacy and safety requirements:

- No unauthorized access to cameras.
- No scraping restricted surveillance streams.
- No facial recognition.
- No license plate recognition.
- Minimize image retention.
- Follow applicable GDPR requirements.
- Use only appropriately licensed or authorized images.
- Do not expose surveillance footage to end users.

This feature is a bonus, not a requirement for MVP.

---

# 10. AI VOICE ASSISTANT

Create an integrated conversational AI mobility assistant.

It should not simply play prerecorded phrases.

The assistant should interpret natural-language requests and interact with real application functions.

## 10.1 Voice Interaction Model

Use a visible microphone control.

The control should remain easily accessible from Explore Mode and Navigation Mode.

However, the microphone should only start listening after user activation.

Do not require always-on background microphone access.

## 10.2 Free Voice Implementation

Use the browser's Web Speech capabilities when supported.

Potential flow:

User voice  
→ Speech Recognition  
→ Text  
→ Gemini API  
→ Structured function call  
→ VLAIQ SmartMatch  
→ Result  
→ SpeechSynthesis

This can operate without a paid voice subscription, subject to browser support, API quotas, and service availability.

Provide a text input fallback.

## 10.3 ElevenLabs Integration

We want to compete in the ElevenLabs "Best Use of ElevenLabs" challenge.

Add genuine integration if free credits and available time permit.

Possible uses:

- Text-to-speech for recommendations
- Natural-sounding voice assistant responses
- Spoken explanations of route alternatives
- Voice alerts when recommendations change
- Speech-to-text if supported by our selected plan

Never hardcode prerecorded responses and present them as dynamic AI.

Use the actual ElevenLabs API for qualifying functionality.

If ElevenLabs is unavailable or exceeds the quota, fall back to the browser's speech synthesis.

Keep API credentials server-side.

## 10.4 Google Gemini Integration

We also want to compete in the "Best Use of Gemini API" challenge.

Gemini should interpret natural-language mobility requests and convert them into structured application commands.

Examples:

"Find the cheapest parking near the city center."

"Show me the route that requires the least walking."

"Find parking near Piața Unirii, maximum 5 minutes on foot."

"Why is this parking option better?"

"Show me a greener alternative."

"I don't want to use public transport."

"Can you find somewhere with accessible parking?"

Support Romanian and English when practical.

## 10.5 Structured Functions

Implement a controlled set of functions, for example:

- searchDestination
- findParking
- setRoutePreference
- setMaximumWalkingTime
- setParkingBudget
- showAlternativeRoutes
- explainRecommendation
- selectParking
- startNavigation
- stopNavigation
- switchToWalking
- getParkingDetails

Use strict input validation.

Gemini must never execute arbitrary code or make unsupported claims.

It must not fabricate parking availability, prices, times, or emissions.

## 10.6 User Experience

Provide:

- Microphone button
- Listening state
- Transcribed request
- Processing state
- AI response text
- Optional spoken response
- Clear error messages
- Permission handling
- Voice output mute
- Cancel / stop listening

Do not use voice features in a way that distracts drivers.

While driving, interactions should remain minimal, with no requirement to read or interact with complex UI panels.

---

# 11. PREMIUM UI/UX REQUIREMENTS

The application must look like a professionally designed mobility startup product.

Not a generic AI-generated dashboard.

Not a basic student template.

We want a distinctive, cohesive, premium user interface.

## 11.1 Visual Identity

Suggested visual style:

- Premium dark mode
- Deep forest green and charcoal backgrounds
- Emerald or mint highlights
- Clear white and soft gray typography
- Minimal amber for warnings
- Strong contrast
- Elegant rounded cards
- Restrained shadows
- Clean map overlay controls
- Consistent iconography
- Premium spacing and typography

Suggested starting colors:

- Forest: #101916
- Primary green: #22C55E
- Mint: #EAF6ED
- Light background: #F7FAF8
- Amber: #F59E0B

Improve these tokens if needed while preserving visual consistency.

Avoid excessive glassmorphism and decoration.

Prioritize readability over visual effects.

## 11.2 Mobile-First Design

Mobile is the primary device.

The map should take up most of the screen.

Use:

- Floating search bar
- Compact top navigation
- Floating action buttons
- Bottom sheets for parking results
- Expandable route cards
- Large touch targets
- Smooth bottom-sheet gestures
- Safe-area support for modern phones
- Clear navigation actions

Do not cover important map information with large panels.

## 11.3 Desktop Layout

On desktop:

- Large interactive map
- Search and filters in a side panel
- Parking recommendation cards
- Expanded route details
- Optional analytics access
- Responsive panels

Avoid simply stretching the mobile layout.

## 11.4 Screens

Implement these screens or states:

1. Main Map / Explore
2. Destination Search
3. Parking Results
4. Parking Details
5. Route Comparison
6. Navigation Mode
7. Walking Navigation
8. AI Assistant
9. Preferences
10. Demo Simulation Controls
11. Analytics Dashboard
12. Optional Login
13. Reporting Parking Availability

The last few may be secondary routes or panels rather than separate full pages.

## 11.5 Essential UI States

Every major feature needs:

- Loading state
- Empty state
- Error state
- Permission denied state
- No network state where applicable
- API rate limit handling
- Unknown parking availability state
- Demo/simulated data indicator

## 11.6 Visual Polish

Use:

- Smooth but efficient animations
- Refined transitions between Explore and Navigation modes
- Interactive map markers
- Clearly highlighted selected parking
- Animated bottom sheets
- Consistent icon design
- Good skeleton loading states
- Subtle feedback after user actions

Avoid slow or unnecessary animations.

## 11.7 Accessibility

Include:

- Semantic controls
- Keyboard navigation
- Visible focus states
- Screen-reader labels
- Adequate contrast
- Large touch targets
- Reduced-motion support
- Voice interaction where supported
- Clear text alternatives

We previously considered helping visually impaired users.

An optional Accessibility Mode may include:

- Accessible parking filters
- Larger text and controls
- Spoken route descriptions
- Clear screen reader support
- Pedestrian path accessibility details when verified

Do not claim that the product safely navigates blind users through streets unless independently validated.

Do not invent wheelchair-accessible routes or accessible parking attributes.

---

# 12. PUBLIC TRANSPORT AND GREEN MOBILITY

Green Mobility is our main competition.

The application must clearly support greener travel decisions rather than only reducing parking search time.

## 12.1 Multimodal Routes

Support comparisons between:

- Driving directly to a nearby parking facility
- Driving to a more distant parking facility and walking
- Driving to an appropriate parking location and continuing by public transport
- Walking where appropriate
- Cycling routes as a later enhancement if data exists

## 12.2 Timișoara GTFS

Investigate the SMTT GTFS dataset.

Potential information:

- Bus lines
- Tram lines
- Trolleybus lines
- Stops
- Routes
- Scheduled trips

Use actual GTFS data where available and permitted.

Do not imply that scheduled arrival times represent live vehicle positions.

Avoid implementing a full OpenTripPlanner deployment if it would consume excessive time.

A reliable smaller transit integration is preferable to a complex broken one.

## 12.3 Environmental Impact

Estimate potential changes in:

- Driving distance
- Time spent driving
- Estimated CO₂ emissions, where supportable

Clearly disclose assumptions.

Never claim real citywide pollution reductions without actual supporting evidence.

Show a useful comparison such as:

"Option B involves 2.4 km less driving than Option A."

Use example numbers only when backed by actual calculations or explicitly marked as a simulated scenario.

---

# 13. COMMUNITY REPORTS

Allow users to help improve parking information.

Potential actions:

- Report available spaces
- Report that parking is full
- Report incorrect parking information
- Report a closed parking facility
- Confirm an existing report

Requirements:

- Timestamp reports
- Prevent repeated spam submissions
- Use cautious aggregation
- Avoid treating a single report as confirmed truth
- Display confidence appropriately
- Offer optional authentication
- Do not require login to browse the map

Auth0 can be integrated for trusted reports if time permits.

---

# 14. ANALYTICS DASHBOARD

Create a separate analytical interface useful for the Tiger Data challenge and city mobility insights.

Potential visualizations:

- Parking occupancy over time
- Latest occupancy updates
- Parking demand trends
- Number of submitted reports
- Parking facility utilization
- Peak activity periods
- Data freshness indicators
- Recommended route categories
- Estimated reduction in unnecessary driving in demo scenarios

If using Tiger Data:

- Use PostgreSQL time-series capabilities
- Implement appropriate hypertables
- Store timestamped parking updates
- Use time-bucketed queries
- Implement continuous aggregates where useful
- Show live or simulated updates clearly
- Document how Tiger Data improves the system

Avoid fake analytics.

Every dashboard chart must be driven by actual stored records or clearly identified simulation data.

---

# 15. ADDITIONAL HACKATHON CHALLENGES

Our main objective remains first place in Green Mobility.

We also want to compete for additional prizes.

The following challenges were shown in our event materials.

Confirm current eligibility and submission requirements with the organizers.

## CHALLENGE J01 — NetRom Software
### Glue It Together
Prize shown: €500

Goal:

Combine APIs, cloud services, AI capabilities, and other tools into a purposeful working solution that goes beyond what individual services can achieve.

Our proposed solution:

Integrate:

- MapLibre
- Routing API
- Parking datasets
- Public transport information
- Gemini
- Backend
- Database
- Optional voice system

Demonstrate an end-to-end smart parking recommendation using multiple services.

Do not integrate unrelated APIs solely to increase the count.

## CHALLENGE J02 — Vest Ventures
### Living Labs Award
Prize shown: €500

Goal:

Demonstrate an interactive development process involving real user validation, feedback, and rapid iteration.

We must:

- Test the product with real participants
- Conduct brief interviews or usability tests
- Record actual observations
- Identify problems
- Improve the product
- Retest where feasible
- Show measurable before/after improvements

Potential test:

Ask participants to find a suitable parking option for a selected destination.

Measure:

- Task completion
- Time needed to choose
- Number of confusing steps
- Self-reported clarity
- User feedback

Document authentic results.

Do not fabricate user interviews or measurements.

## CHALLENGE J03 — Solana
### Best Use of Solana
Prize shown: Hardware wallets

Possible optional integration:

A transparent on-chain reward or contribution record for verified community parking reports.

However:

- Blockchain is not required for our core product.
- Do not add speculative financial mechanics.
- Do not create an unnecessary token economy.
- Do not jeopardize the MVP.

Treat this as low priority unless a compelling use case emerges.

## CHALLENGE J04 — ElevenLabs
### Best Use of ElevenLabs
Prize shown: Wireless earbuds

Build a genuine voice-enabled mobility assistant.

Use real ElevenLabs capabilities.

Potential features:

- Spoken recommendations
- Conversational response output
- Route explanation
- Multilingual speech

Integrate naturally with the mobility workflow.

## CHALLENGE J05 — Google Gemini
### Best Use of Gemini API
Prize shown: MLH swag kits

Build a genuinely useful AI mobility copilot.

Gemini should interpret flexible user requests and select suitable application actions.

Demonstrate function calling, constrained inputs, and real results.

Avoid a superficial chatbot that does not influence the application.

## CHALLENGE J06 — Tiger Data
### Best Use of Tiger Data
Prize shown: Stream Deck Mini

Build a time-series data pipeline and interactive analytics functionality.

Use Tiger Data features meaningfully.

Show occupancy updates and time-based trends.

## CHALLENGE J07 — Vultr
### Best Use of Vultr
Prize shown: M5Stack Tab5

Deploy the actual backend or relevant computing infrastructure on Vultr.

Show a functioning cloud deployment.

Use free credits only if legitimately available and within their conditions.

## CHALLENGE J08 — Auth0
### Best Use of Auth0
Prize shown: Wireless headphones for each team member

Use Auth0 for:

- Social or passwordless authentication
- Protected community reporting
- Role-based functionality where useful

Do not gate the primary demo behind mandatory registration.

## CHALLENGE J09 — Entire
### Best Use of Entire
Prize shown: Mini portable projector

Use Entire meaningfully in the AI-assisted development workflow.

Explore:

- Shared agent context
- Development sessions
- Codebase mapping
- Collaborative agent/human workflows
- Persistent context

Provide actual evidence of its use if submitting to this challenge.

Do not claim an integration that has not been performed.

## Challenge Priority

Tier 1:
- Green Mobility
- NetRom
- Living Labs

Tier 2:
- Gemini
- Tiger Data
- ElevenLabs

Tier 3:
- Vultr
- Auth0
- Entire

Optional:
- Solana

Finish the core product before investing in marginal award integrations.

---

# 16. EXISTING OPEN-SOURCE PROJECTS TO STUDY

We have identified several potential references.

Review them for architecture, reusable patterns, components, and licensing.

Do not copy source code without checking permission and attribution requirements.

### MapLibre GL JS

https://maplibre.org/maplibre-gl-js/

Use for the interactive map, navigation camera, vehicle marker, and routes.

### MapLibre GL Directions

https://github.com/maplibre/maplibre-gl-directions

Potential routing UI component.

### MapLibre Animate a Point Along a Route

https://maplibre.org/maplibre-gl-js/docs/examples/animate-a-point-along-a-route/

Use as a technical reference for navigation simulation.

### Valhalla Web App

https://github.com/valhalla/web-app

Study its routing and map functionality.

### Parking Spot Finder

https://github.com/Johnkelvin-J/parking

Study parking-specific components and reporting flows, subject to license verification.

### opentransit

https://github.com/jeronimotech/opentransit

Study multimodal transportation architecture and GTFS integration.

### Fleet Tracker

https://github.com/mfaisal5709/fleet-tracker

Study vehicle animation and tracking concepts. Verify licensing before reusing any source.

### Parking Vision

https://github.com/viniciusslvdor/parking-vision

Optional computer vision reference.

### Parking Slot Detection

https://github.com/visualbuffer/parkingslot

Optional parking occupancy detection reference.

The objective is to reuse standard infrastructure responsibly while creating original value through SmartMatch, multimodal recommendations, and user experience.

---

# 17. DATABASE DESIGN

Create a schema suited to the MVP.

Potential tables:

## parkings

- id
- name
- latitude
- longitude
- address
- parking_type
- total_capacity
- verified_price
- accessibility_attributes
- source
- source_last_checked

## parking_updates

- id
- parking_id
- timestamp
- occupied_spaces
- free_spaces
- source_type
- confidence
- is_simulated

## user_reports

- id
- parking_id
- user_id
- report_type
- timestamp
- verification_status

## transit_stops

- id
- name
- latitude
- longitude
- external_stop_id

## route_requests

- id
- origin
- destination
- preference
- timestamp

## route_options

- id
- request_id
- parking_id
- driving_duration
- walking_duration
- transit_duration
- total_duration
- estimated_cost
- driving_distance
- environmental_estimate
- data_quality

Only store what is needed.

Avoid collecting unnecessary personal location histories.

Choose appropriate geometry and indexing.

Use geographic querying where useful.

---

# 18. API DESIGN

Create a consistent typed API.

Potential endpoints:

GET /api/health

GET /api/parkings

GET /api/parkings/:id

GET /api/parkings/:id/availability

POST /api/routes/compare

POST /api/routes/navigation

POST /api/assistant/command

POST /api/assistant/speech

POST /api/reports

GET /api/analytics/occupancy

POST /api/demo/simulation

The demo mutation endpoints must be protected or restricted to demo environments.

Define request and response types.

Validate inputs.

Handle:

- API errors
- Invalid coordinates
- Provider timeouts
- Rate limits
- Unavailable data
- Missing credentials

Do not expose API keys in frontend code.

---

# 19. SECURITY AND PRIVACY

Security must be considered from the beginning.

Requirements:

- Environment variables for credentials
- No secrets committed to GitHub
- `.env.example`
- `.gitignore`
- HTTPS
- Backend input validation
- Appropriate CORS
- Rate limiting
- Secure error handling
- Minimal personal data collection
- Optional authentication for reports
- No unauthorized surveillance access
- No public exposure of raw camera feeds
- Safe storage of user-generated reports
- No logging of sensitive conversations by default

Never place Gemini, ElevenLabs, Auth0 secrets, or other private credentials directly into a client-side bundle.

---

# 20. PERFORMANCE REQUIREMENTS

The application must remain responsive on ordinary smartphones.

Optimize:

- Map rendering
- React rerenders
- Location updates
- Routing requests
- API calls
- Animation frame usage
- Asset loading
- Database queries
- Data caching
- Mobile network performance

Avoid:

- Excessive animations
- Unnecessary polling
- Heavy dependencies
- Huge map datasets sent to the frontend
- Repeated API requests for unchanged routes

Use debouncing where appropriate.

Clean up geolocation watchers and other subscriptions.

Respect mapping service usage limits.

---

# 21. GITHUB AND TEAM COLLABORATION

All four members will work collaboratively.

Use one shared GitHub repository.

Recommended structure:

```text
vlaiq-flow/
  frontend/
    src/
      app/
      components/
      features/
        map/
        parking/
        routing/
        navigation/
        assistant/
        analytics/
      hooks/
      services/
      types/
      styles/
    public/
  backend/
    src/
      routes/
      services/
      adapters/
      engines/
      middleware/
      types/
  database/
    migrations/
    seeds/
  docs/
    architecture/
    data-sources/
    challenge-evidence/
    user-testing/
  README.md
  LICENSE
  .gitignore
  .env.example
```

Adjust the structure if a simpler monorepo is better.

Use branches.

Suggested responsibilities:

Member 1:
- Frontend
- Design system
- Responsive UI

Member 2:
- Maps
- GPS
- Navigation
- Routing

Member 3:
- Backend
- Database
- Parking data
- Deployment

Member 4:
- Recommendation engine
- AI integration
- Testing
- Demo preparation

Responsibilities may overlap.

Define interfaces between modules early so that work can proceed in parallel.

Avoid merge conflicts and last-minute integrations.

All third-party code should be documented with source links and license obligations.

---

# 22. DEPLOYMENT AND QR ACCESS

The final application must be publicly accessible.

Potential deployment:

Frontend:
- Vercel

Backend:
- Vultr or another suitable service

Database:
- Managed PostgreSQL or Tiger Data

Requirements:

- Public HTTPS URL
- Working API access
- Responsive mobile interface
- No localhost dependencies
- No mandatory login for the main demo
- Working QR code pointing to the deployed application

Create a simple QR presentation asset once the production URL is confirmed.

The judges should be able to scan the QR code, open the application, select a destination, and test the main features.

Also include a "Try Demo" button.

The judges should not have to grant GPS access to experience the demo.

Use a predefined Timișoara origin in Demo Mode.

---

# 23. LIVE JUDGING DEMONSTRATION

We want an impressive, reliable presentation that demonstrates real functionality.

Design the application around the following demo.

## Demo Step 1 — Open VLAIQ

Open the public URL.

Show the interactive map centered on Timișoara.

Explain the parking and mobility problem briefly.

## Demo Step 2 — Select Destination

Search for Piața Victoriei.

The application finds nearby parking options.

## Demo Step 3 — Compare Routes

Show:

- Fastest
- Cheapest
- Greenest

Explain why the recommendations differ.

Display meaningful route details.

## Demo Step 4 — Start Navigation

Select a parking facility.

Press Start Navigation.

The application shows:

- Highlighted route
- Animated vehicle marker
- Camera following vehicle
- Remaining distance
- Estimated arrival

Use Demo Simulation Mode.

## Demo Step 5 — Dynamic Rerouting

Change simulated occupancy so that the originally recommended parking becomes full.

The system detects the change and recommends an alternative.

Show the updated route.

## Demo Step 6 — AI Assistant

Use a voice command such as:

"Find me cheaper parking with no more than five minutes of walking."

Show Gemini interpreting the request.

Show the updated recommendation.

Read the explanation aloud using ElevenLabs if the integration is available.

## Demo Step 7 — Final Walking Route

Simulate arrival at the parking facility.

Switch to walking navigation.

Show the route from the parking facility to the original destination.

## Demo Step 8 — Analytics

Open the occupancy analytics dashboard.

Show actual stored or explicitly simulated time-series updates.

## Demo Step 9 — Audience Interaction

Display the QR code.

Allow judges to open the app on their own devices.

## Demo Step 10 — Explain the Technology

Briefly demonstrate:

- Architecture
- GitHub repository
- Integrated APIs
- Data quality
- Actual innovations
- Testing evidence
- Potential citywide scalability

Prepare a screen recording in case an API or the network fails.

The primary demo must remain functional even if Gemini or ElevenLabs temporarily fail.

---

# 24. LIVING LABS USER VALIDATION

We want credible, measurable product validation.

Design a short usability study suitable for a hackathon.

Suggested questions:

1. How do you currently find parking in Timișoara?
2. What frustrates you most about finding parking?
3. Would you accept a longer walking distance to reduce parking search time?
4. Which information matters most: time, price, or availability?
5. Is the recommendation screen easy to understand?
6. What would you improve?

Ask volunteers to perform actual tasks in the application.

Record:

- Anonymous participant identifiers
- Task success
- Completion times
- Confusing interactions
- Suggestions
- Changes implemented afterward

Do not invent participants or responses.

Create a before/after improvement summary using collected evidence.

---

# 25. RECOMMENDED DEVELOPMENT SKILLS

We are considering using Claude Code and AI coding agents.

Use applicable development skills when available.

Priority tools:

### Frontend Design — Anthropic

https://claude.com/plugins/frontend-design

Use for premium UI implementation.

### React Best Practices — Vercel

https://github.com/vercel-labs/agent-skills

Use for React performance and architecture.

### Web Design Guidelines — Vercel

Use for usability, accessibility, and visual review.

### Agent Browser

https://github.com/vercel-labs/agent-browser

Use for automated browser interaction and testing.

### Code Review — Anthropic

https://claude.com/plugins/code-review

Use for checking changes and reducing implementation errors.

Additional UI components:

https://ui.shadcn.com/

These tools are optional enhancements.

Do not make the project depend on a proprietary skill.

---

# 26. DEVELOPMENT PRIORITIES

We have only approximately 48 hours.

Avoid building everything simultaneously.

## P0 — ESSENTIAL MVP

These features must work:

- Functional React application
- Premium responsive interface
- Interactive map of Timișoara
- Destination search
- Verified parking locations
- Parking result cards
- Basic recommendation engine
- At least two meaningful route alternatives
- Driving route geometry
- Navigation simulation
- Public deployment
- GitHub repository
- No mandatory login
- Clearly identified demo data

## P1 — CORE DIFFERENTIATORS

Implement after P0:

- Fastest, Cheapest, Greenest comparison
- Driving-to-walking transition
- Smart rerouting when parking becomes unavailable
- Live GPS mode
- Public transport integration
- Better confidence and data freshness indicators
- Basic user testing

## P2 — AWARD INTEGRATIONS

Implement only once the core is stable:

- Gemini function calling
- ElevenLabs voice output
- Tiger Data analytics
- Auth0 community reporting
- Vultr deployment
- Entire workflow integration

## P3 — OPTIONAL ADVANCED FEATURES

Only if sufficient time remains:

- Camera-based parking detection
- Predictive parking availability
- Advanced accessibility features
- Blockchain reporting rewards
- Complex public transport routing
- Advanced 3D navigation
- Personalized user accounts

Never sacrifice a working MVP to chase a low-priority feature.

---

# 27. APPROXIMATE HACKATHON EXECUTION PLAN

## November 13 — Day One

Primary goal: Working foundation.

- Create GitHub repository.
- Establish code structure.
- Configure frontend.
- Configure map.
- Add destination search.
- Load parking data.
- Implement initial route calculation.
- Create recommendation cards.
- Implement first complete user journey.
- Deploy a preliminary version.

## November 14 — Day Two

Primary goal: Intelligence and differentiation.

- Implement SmartMatch improvements.
- Add three comparison modes.
- Add simulated navigation.
- Add dynamic parking occupancy updates.
- Add rerouting.
- Add walking transition.
- Integrate one or more challenge technologies.
- Conduct real usability tests.
- Improve interface based on findings.

## November 15 — Final Day

Primary goal: Stability and presentation.

- Fix critical bugs.
- Verify mobile experience.
- Test GPS permission handling.
- Test demo mode.
- Confirm production deployment.
- Verify QR code.
- Finish documentation.
- Prepare pitch.
- Record backup demo.
- Complete challenge submissions.

Reserve meaningful time for debugging and integration.

Do not keep adding features until the deadline.

---

# 28. DEFINITION OF DONE

The application is considered ready for the hackathon when:

1. It opens from a public HTTPS link.
2. It works on a phone.
3. The map loads correctly.
4. A user can select a destination.
5. Real parking locations appear.
6. Data quality labels are accurate.
7. The application can compare useful parking options.
8. A real routed geometry appears on the map.
9. Navigation simulation works.
10. A vehicle marker moves along the route.
11. The app can show a route change when simulated occupancy changes.
12. Users can continue on foot to the final destination.
13. The app remains usable without paid AI APIs.
14. Optional integrations fail gracefully.
15. No sensitive credentials are exposed.
16. The repository is documented.
17. The demo QR code works.
18. The presentation is repeatable.
19. The architecture can be explained.
20. The team can honestly distinguish working functionality, estimates, simulated elements, and future plans.

---

# 29. WHAT MAKES OUR PROJECT COMPETITIVE

We are not trying to impress judges with the largest possible number of technologies.

We want them to see:

**A real problem** — Parking search wastes time and increases unnecessary driving.

**A practical solution** — Intelligent parking recommendations integrated with navigation.

**A sustainability contribution** — Users can compare driving, walking, and public transport options.

**Technical depth** — Geographic routing, recommendation algorithms, time-series data, and optional AI.

**A premium product experience** — A polished application that users can explore themselves.

**A working prototype** — Not just slides and mockups.

**Evidence of testing** — Real user feedback and documented improvements.

**Scalability** — Potential expansion beyond Timișoara.

We should be able to explain why VLAIQ is more useful than a static parking map.

---

# 30. FINAL INSTRUCTIONS TO THE AI AGENT

Act as an expert engineering partner, not as a passive code generator.

Your responsibilities:

1. Analyze the requirements critically.
2. Identify major technical risks and missing external dependencies.
3. Select the simplest robust implementation architecture.
4. Avoid unnecessary complexity.
5. Create a cohesive design system.
6. Produce clean, modular, maintainable code.
7. Prefer genuinely working features over visual mockups.
8. Clearly separate actual data from simulated data.
9. Verify third-party licenses before code reuse.
10. Keep the application functional when optional integrations fail.
11. Implement and test features incrementally.
12. Provide exact setup and execution instructions.
13. Do not expose credentials.
14. Do not claim implementation success without testing.
15. Do not fabricate API responses, test results, user interviews, or parking availability.
16. Keep the team informed of which features are completed, incomplete, blocked, or optional.
17. Optimize for a functional hackathon submission and excellent live demonstration.
18. Explain tradeoffs clearly.
19. Avoid rewriting working modules unnecessarily.
20. Prioritize quality, usability, technical credibility, and originality.

## REQUIRED FIRST RESPONSE

Before writing the full application, produce:

**A. Product architecture**

The recommended technical architecture and why it is appropriate for a 48-hour hackathon.

**B. Feature prioritization**

Separate P0, P1, P2, and P3 features with estimated dependencies.

**C. Complete UI structure**

Define the screens, main layout components, navigation behavior, and design system.

**D. Data strategy**

Explain which information can be sourced from real datasets, which needs verification, and which requires clearly labeled simulation.

**E. Team execution plan**

Divide work across four developers with minimal integration conflicts.

**F. Initial repository structure**

Provide a complete practical folder structure.

**G. Technical risks**

Identify API limits, data availability, map licensing, navigation reliability, mobile browser behavior, and deployment problems.

**H. First implementation milestone**

Define a small, fully testable vertical slice: launch the application, select a destination, show verified parking locations, calculate a route, and display it on the map.

After presenting this plan, begin implementing the first milestone using real, runnable project files.

Do not stop at high-level suggestions.

Write actual code, connect modules, explain required environment variables, and define how to test the result.

As work progresses, implement subsequent milestones while preserving the stability of the previous ones.

## FINAL GOAL

Create **VLAIQ FLOW**, a premium smart parking and green mobility web application that makes urban journeys easier, smarter, and potentially more sustainable.

It must be impressive enough to demonstrate at UniHack Timișoara 2026 and reliable enough for judges to interact with on their own phones.

Our goal is to compete seriously for first place in Green Mobility while using the same coherent platform to address relevant sponsor challenges.

**Build something real, functional, technically impressive, beautiful, and genuinely useful.**

**Let's build VLAIQ.**
