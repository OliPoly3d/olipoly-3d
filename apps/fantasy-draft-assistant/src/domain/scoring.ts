export type ScoringCategory = 'passing' | 'rushing' | 'receiving' | 'kicking' | 'defense' | 'miscellaneous'
export interface ScoringRule {
  id: string
  category: ScoringCategory
  label: string
  points: number | null
  increment?: number
  minimum?: number
  maximum?: number
  unresolved?: boolean
}
const rule = (category: ScoringCategory, id: string, label: string, points: number | null, thresholds: Partial<ScoringRule> = {}): ScoringRule => ({ category, id, label, points, ...thresholds })
export const believelandScoringRules: ScoringRule[] = [
  rule('passing','passing_yards_25','Every 25 passing yards',1,{increment:25}), rule('passing','passing_td','Passing TD',6), rule('passing','passing_td_40_bonus','40+ yard passing TD bonus',1,{minimum:40}), rule('passing','passing_td_50_bonus','50+ yard passing TD bonus',2,{minimum:50}), rule('passing','passing_interception','Interception thrown',-2), rule('passing','passing_two_point','2-point passing conversion',2), rule('passing','passing_game_300_399','300–399 passing-yard game',1,{minimum:300,maximum:399}), rule('passing','passing_game_400','400+ passing-yard game',2,{minimum:400}),
  rule('rushing','rushing_yards_10','Every 10 rushing yards',1,{increment:10}), rule('rushing','rushing_td','Rushing TD',6), rule('rushing','rushing_td_40_bonus','40+ yard rushing TD bonus',1,{minimum:40}), rule('rushing','rushing_td_50_bonus','50+ yard rushing TD bonus',2,{minimum:50}), rule('rushing','rushing_two_point','2-point rushing conversion',2),
  rule('receiving','receiving_yards_10','Every 10 receiving yards',1,{increment:10}), rule('receiving','reception','Reception',1), rule('receiving','receiving_td','Receiving TD',6), rule('receiving','receiving_td_40_bonus','40+ yard receiving TD bonus',1,{minimum:40}), rule('receiving','receiving_td_50_bonus','50+ yard receiving TD bonus',2,{minimum:50}), rule('receiving','receiving_two_point','2-point receiving conversion',2), rule('receiving','receiving_game_200','200+ receiving-yard game',2,{minimum:200}),
  rule('kicking','pat_made','PAT made',1), rule('kicking','pat_missed','PAT missed',-1), rule('kicking','fg_missed','Total FG missed',-1), rule('kicking','fg_0_39','FG made 0–39 yards',3,{minimum:0,maximum:39}), rule('kicking','fg_40_49','FG made 40–49 yards',4,{minimum:40,maximum:49}), rule('kicking','fg_50_59','FG made 50–59 yards',5,{minimum:50,maximum:59}), rule('kicking','fg_60','FG made 60+ yards',5,{minimum:60}),
  ...[['kickoff_return_td','Kickoff return TD',6],['punt_return_td','Punt return TD',6],['interception_return_td','Interception return TD',6],['fumble_return_td','Fumble return TD',6],['blocked_return_td','Blocked punt or FG return TD',6],['sack','Sack',1],['blocked_kick','Blocked Punt/PAT/FG',2],['interception','Interception',2],['fumble_recovered','Fumble recovered',2],['fumble_forced','Fumble forced',1],['safety','Safety',2]] .map(([id,label,points])=>rule('defense',String(id),String(label),Number(points))),
  rule('defense','points_allowed_0','0 points allowed',10,{minimum:0,maximum:0}), rule('defense','points_allowed_1_6','1–6 points allowed',5,{minimum:1,maximum:6}), rule('defense','points_allowed_7_13','7–13 points allowed',3,{minimum:7,maximum:13}), rule('defense','points_allowed_14_17','14–17 points allowed',1,{minimum:14,maximum:17}), rule('defense','points_allowed_18_21','18–21 points allowed',null,{minimum:18,maximum:21,unresolved:true}), rule('defense','points_allowed_22_27','22–27 points allowed',null,{minimum:22,maximum:27,unresolved:true}), rule('defense','points_allowed_28_34','28–34 points allowed',-1,{minimum:28,maximum:34}), rule('defense','points_allowed_35_45','35–45 points allowed',-3,{minimum:35,maximum:45}), rule('defense','points_allowed_46','46+ points allowed',-5,{minimum:46}),
  ...[['kickoff_return_td','Kickoff Return TD',6],['punt_return_td','Punt Return TD',6],['fumble_recovery_td','Fumble Recovered for TD',6],['fumbles_lost','Total Fumbles Lost',-2],['interception_return_td','Interception Return TD',6],['fumble_return_td','Fumble Return TD',6],['blocked_return_td','Blocked Punt or FG Return TD',6]].map(([id,label,points])=>rule('miscellaneous',String(id),String(label),Number(points)))
]
