// @vitest-environment jsdom
import {describe,expect,it} from 'vitest';
import {playerDataCenterMarkup} from './player-data-center';
import type {ParsedSource} from '../data/player-data-center';
const staged:ParsedSource={id:'FP_PPR',season:2026,filename:'ppr.csv',timestampConfidence:'LOW',rows:[{source:'FP_PPR',playerName:'Player One',metadata:{}}],mapping:[{original:'Player',normalized:'PLAYER',semantic:'player'}],unknownColumns:['Extra'],warnings:[],errors:[]};
describe('guided Player Data Center',()=>{
 it('presents one primary action and the simple four-step flow',()=>{const html=playerDataCenterMarkup();expect(html).toContain('START PLAYER DATA UPDATE');expect(html).toContain('1. Gather Files');expect(html).toContain('2. Add Files');expect(html).toContain('3. Review');expect(html).toContain('4. Activate')});
 it('supports row upload, concise progress, hidden optional columns, and intent confirmation',()=>{const html=playerDataCenterMarkup(undefined,[staged]);expect(html).toContain('data-source-upload="FP_PPR"');expect(html).toContain('Ready — 1 records found');expect(html).toContain('1 unused columns');expect(html).toContain('Treating this file as FantasyPros PPR Rankings');expect(html).not.toContain('Mapping needs attention')});
 it('shows mapping only for a blocking recognition error',()=>{const html=playerDataCenterMarkup(undefined,[{...staged,errors:['Required Player column was not found.']}]);expect(html).toContain('Mapping needs attention');expect(html).toContain('disabled>ACTIVATE PLAYER DATA')});
 it('advertises PDF as the normal ESPN injury workflow and keeps NFL disabled',()=>{const html=playerDataCenterMarkup();expect(html).toContain('choose Print, select Save as PDF');expect(html).toContain('ESPN NFL Injuries');expect(html).toContain('planned/disabled');expect(html).not.toContain('ESPN Injury Status Complete HTML')});
});
