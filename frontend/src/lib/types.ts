// Shapes returned by the Django API (pulse/api/).

export type User = {
  id: number
  username: string
  email: string
  full_name: string
  is_staff: boolean
  /** The club every screen is about right now; null until they're an approved officer somewhere. */
  club: ClubSummary | null
  /** Every club they're an officer of or waiting to join. */
  clubs: UserClub[]
}

export type ClubSummary = { id: number; name: string; club_type: string; fields: string[] }

export type UserClub = ClubSummary & { status: "active" | "pending" }

export type ClubMember = {
  id: number
  username: string
  name: string
  email: string
  status: "active" | "pending"
  joined: string
  is_you: boolean
}

export type Club = ClubSummary & { description: string; members: ClubMember[] }

export type ClubSearchResult = { id: number; name: string; club_type: string; officers: number; your_status: UserClub["status"] | null }

type Option = { value: string; label: string }

export type Taxonomy = {
  club_types: Option[]
  field_groups: { label: string; fields: Option[] }[]
  event_types: Option[]
}

export type AppNotification = {
  id: number
  kind: "first_scan" | "move_it" | "recap" | "join_request"
  title: string
  body: string
  link: string
  club: { id: number; name: string }
  created_at: string
  read: boolean
}

export type BoardRecommendation = { board_id: number; tier: "strong" | "good"; reason: string }

export type RecapBoard = {
  slug: string
  board_id: number
  board: string
  tag: string
  label: string
  scans: number
  unique: number
  days_up: number
  per_day: number
}

export type EventRecap = {
  has_ended: boolean
  total: number
  unique: number
  flyers: number
  before_start: number | null
  boards: RecapBoard[]
  best: RecapBoard | null
  no_scans: RecapBoard[]
  next_time: (BoardRecommendation & { tag: string; board: string })[]
}

export type AppConfig = {
  campus_name: string
  campus_short_name: string
  center: [number, number]
  zoom: number
  default_radius_meters: number
  site_url: string
  /** A vector map (Amazon Location) when the server has a key, otherwise raster tiles. */
  tiles: VectorTiles | RasterTiles
}

export type RasterTiles = { kind: "raster"; url: string; attribution: string; max_zoom: number }
/** `fallback` is for browsers that can't draw vector maps (no WebGL2). */
export type VectorTiles = { kind: "vector"; style_url: string; max_zoom: number; fallback: RasterTiles }

export type Session = { user: User | null; config: AppConfig }

export type Board = {
  id: number
  /** Unique sign tag, e.g. "CMU" or "JON2". */
  tag: string
  name: string
  area: string
  building: string
  floor: string
  description: string
  latitude: number
  longitude: number
  is_active: boolean
}

export type LeaderboardRow = {
  id: number
  tag: string
  name: string
  area: string
  building: string
  floor: string
  is_active: boolean
  lifetime_scans: number
  flyer_count: number
  avg_scans_per_flyer_day: number
}

export type MapFlyer = { id: number; slug: string; event: string; event_id: number; label: string; scans: number }

export type BoardProperties = {
  id: number
  tag: string
  name: string
  area: string
  building: string
  floor: string
  description: string
  board_count: number | null
  is_active: boolean
  total_scans: number
  unique_scans: number
  active_flyer_count: number
  flyers: MapFlyer[]
}

export type BoardFeature = {
  type: "Feature"
  geometry: { type: "Point"; coordinates: [number, number] }
  properties: BoardProperties
}

export type BoardCollection = { type: "FeatureCollection"; features: BoardFeature[] }

export type ClubEvent = {
  id: number
  name: string
  event_type: string
  destination_url: string
  start_date: string | null
  end_date: string | null
  /** The club's name (admins see every club's events). */
  club: string
  has_ended: boolean
  created_at: string
}

export type EventRow = ClubEvent & { flyer_count: number; active_flyer_count: number; total_scans: number }

export type EventSummary = {
  total: number
  unique: number
  active_flyers: number
  best_board: { board_id: number; tag: string; board: string; total: number; unique: number } | null
}

export type FlyerRow = {
  slug: string
  board: string
  board_id: number
  board_building: string
  board_tag: string
  label: string
  posted_at: string
  removed_at: string | null
  is_active: boolean
  days_posted: number
  total_scans: number
  unique_scans: number
  scans_per_day: number
  after_removal_scans: number
}

export type FlyerDetail = {
  slug: string
  label: string
  posted_at: string
  removed_at: string | null
  is_active: boolean
  days_posted: number
  scans_per_day: number
  destination: string
  destination_override: string
  scan_url: string
  short_url: string
  board: { id: number; tag: string; name: string; area: string; building: string; floor: string }
  event: { id: number; name: string; event_type: string; start_date: string | null; end_date: string | null; has_ended: boolean }
  /** Up for days with no scans while the event is still ahead. */
  move_it: boolean
  counts: { total: number; unique: number; after_removal: number; bots?: number }
  devices: { device_type: string; total: number }[]
}

export type DayPoint = { date: string; total: number; unique: number }
export type HourPoint = { hour: number; total: number }
export type BoardScans = { board_id: number; tag: string; board: string; total: number; unique: number }
