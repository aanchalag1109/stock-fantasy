@extends('admin.layouts.app')

@section('content')
@php
    $isFixed = in_array($contest->category, ['guaranteed','practice']) || !empty($contest->is_fixed_prize);
    $existingTree = json_decode($contest->prize_distribution ?? '[]', true) ?: [];
@endphp
<div class="container-fluid py-3">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-1"><i class="bi bi-pencil-square text-warning me-2"></i>Edit Contest #{{ $contest->id }}</h1>
            <p class="text-muted mb-0">Category: <strong>{{ ucfirst($contest->category) }}</strong> | {{ $isFixed ? '🔒 Fixed Pool' : '📈 Dynamic Pool' }}</p>
        </div>
        <a href="{{ route('admin.contests.index') }}" class="btn btn-outline-secondary"><i class="bi bi-arrow-left me-1"></i>Back</a>
    </div>

    @if ($errors->any())
        <div class="alert alert-danger border-0 shadow-sm">
            <strong><i class="bi bi-exclamation-triangle-fill me-2"></i>Errors:</strong>
            <ul class="mb-0 mt-2">@foreach ($errors->all() as $e)<li>{{ $e }}</li>@endforeach</ul>
        </div>
    @endif

    <form id="editContestForm" method="POST" action="{{ route('admin.contests.update', $contest->id) }}">
        @csrf @method('PUT')
        <div class="row">
            <div class="col-lg-8">
                <div class="card border-0 shadow-sm mb-4">
                    <div class="card-header bg-warning text-white"><i class="bi bi-gear-fill me-2"></i>Contest Parameters</div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-6 mb-3">
                                <label class="form-label fw-semibold">Session</label>
                                <select name="league_session_id" class="form-select" required>
                                    @foreach($sessions as $s)
                                        @php $sid=is_array($s)?$s['id']:$s->id; $sname=is_array($s)?$s['display_name']:$s->name; @endphp
                                        <option value="{{ $sid }}" {{ $contest->league_session_id==$sid?'selected':'' }}>{{ $sname }}</option>
                                    @endforeach
                                </select>
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label fw-semibold">Category</label>
                                <select id="category" name="category" class="form-select" required onchange="onCategoryChange()">
                                    <option value="mega" {{ $contest->category=='mega'?'selected':'' }}>🏆 Mega (Dynamic)</option>
                                    <option value="equal" {{ $contest->category=='equal'?'selected':'' }}>⚖️ Equal (Dynamic)</option>
                                    <option value="guaranteed" {{ $contest->category=='guaranteed'?'selected':'' }}>🎯 Guaranteed (Fixed)</option>
                                    <option value="practice" {{ $contest->category=='practice'?'selected':'' }}>🎓 Practice (Fixed)</option>
                                </select>
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label fw-semibold">Max Entries / User</label>
                                <input type="number" name="max_entries_per_user" class="form-control" value="{{ $contest->max_entries_per_user??1 }}" min="1" required>
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label fw-semibold">Total Spots</label>
                                <input type="number" id="participants" name="participants" class="form-control" value="{{ $contest->participants }}" min="2" required oninput="recalc()">
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label fw-semibold">Entry Fee</label>
                                <input type="number" id="entry_fee" name="entry_fee" class="form-control" value="{{ $contest->entry_fee }}" min="0" step="0.01" oninput="recalc()">
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label fw-semibold">Platform Fee %</label>
                                <input type="number" id="platform_fee" name="platform_fee" class="form-control" value="{{ $contest->platform_fee }}" min="0" max="100" step="0.1" required oninput="recalc()">
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label fw-semibold">Winning %</label>
                                <input type="number" id="winning_percentage" name="winning_percentage" class="form-control" value="{{ $contest->winning_percentage }}" min="0" max="100" step="0.1" required oninput="recalc()">
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card border-0 shadow-sm mb-4" style="background:linear-gradient(135deg,#fff3cd,#ffeaa7);">
                    <div class="card-body py-3">
                        <h6 class="text-warning mb-2"><i class="bi bi-calculator me-2"></i>Live Calculation</h6>
                        <div class="row text-center g-2">
                            <div class="col-md-3"><div class="p-2 bg-white rounded"><small class="text-muted d-block">Total Pool</small><strong class="text-success" id="o_totalPool">0</strong></div></div>
                            <div class="col-md-3"><div class="p-2 bg-white rounded"><small class="text-muted d-block">Platform Fee</small><strong class="text-danger" id="o_platformFee">0</strong></div></div>
                            <div class="col-md-3"><div class="p-2 bg-white rounded"><small class="text-muted d-block">Prize Pool</small><strong class="text-primary" id="o_prizePool">0</strong></div></div>
                            <div class="col-md-3"><div class="p-2 bg-white rounded"><small class="text-muted d-block">Winners</small><strong class="text-warning" id="o_winners">0</strong></div></div>
                        </div>
                    </div>
                </div>

                {{-- Auto tiers (Mega/Equal) --}}
                <div id="autoStructureBox" class="card border-0 shadow-sm mb-4 {{ $isFixed ? 'd-none' : '' }}">
                    <div class="card-header bg-warning text-white d-flex justify-content-between align-items-center">
                        <span><i class="bi bi-award me-2"></i>Prize Structure (Auto-generated)</span>
                        <button type="button" class="btn btn-light btn-sm" onclick="regenerateAutoTiers()"><i class="bi bi-arrow-clockwise me-1"></i>Regenerate</button>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-sm mb-0">
                                <thead class="table-light"><tr><th>Rank Range</th><th>Winners</th><th>% of Pool</th><th>Per Winner</th><th>Subtotal</th></tr></thead>
                                <tbody id="autoTiersBody"></tbody>
                                <tfoot><tr class="fw-bold bg-light"><td colspan="3" class="text-end">Total:</td><td colspan="2" id="autoTotal">0</td></tr></tfoot>
                            </table>
                        </div>
                    </div>
                </div>

                {{-- Tree builder (Guaranteed/Practice) --}}
                <div id="treeStructureBox" class="card border-0 shadow-sm mb-4 {{ !$isFixed ? 'd-none' : '' }}">
                    <div class="card-header bg-danger text-white d-flex justify-content-between align-items-center">
                        <span><i class="bi bi-diagram-3 me-2"></i>Prize Tree (Fixed — total = prize pool)</span>
                        <button type="button" class="btn btn-light btn-sm" onclick="addTreeRow()"><i class="bi bi-plus-lg"></i> Add Row</button>
                    </div>
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-sm align-middle">
                                <thead class="table-light"><tr><th>Rank Start</th><th>Rank End</th><th>Winners</th><th>Per Winner</th><th>Subtotal</th><th></th></tr></thead>
                                <tbody id="treeBody"></tbody>
                                <tfoot><tr class="fw-bold bg-warning bg-opacity-25"><td colspan="4" class="text-end">Fixed Prize Pool =</td><td id="treeTotal" class="text-danger fw-bold fs-5">0</td><td></td></tr></tfoot>
                            </table>
                        </div>
                        <div id="treeWarning" class="text-danger small fw-bold"></div>
                    </div>
                </div>
            </div>

            <div class="col-lg-4">
                <div class="card border-0 shadow-sm mb-4">
                    <div class="card-header bg-dark text-white"><i class="bi bi-pin-angle me-2"></i>Pin & Display</div>
                    <div class="card-body">
                        <div class="form-check form-switch mb-3">
                            <input class="form-check-input" type="checkbox" name="is_pinned" id="is_pinned" value="1" {{ $contest->is_pinned?'checked':'' }}>
                            <label class="form-check-label fw-semibold" for="is_pinned">Pin to top</label>
                        </div>
                        <label class="form-label small">Pin Order</label>
                        <input type="number" name="pin_order" class="form-control form-control-sm" value="{{ $contest->pin_order??0 }}" min="0">
                    </div>
                </div>

                <div class="card border-0 shadow-sm mb-4">
                    <div class="card-header bg-info text-white"><i class="bi bi-robot me-2"></i>Bot Auto-Join</div>
                    <div class="card-body">
                        <label class="form-label small fw-semibold">Number of bots</label>
                        <input type="number" name="bot_count" class="form-control form-control-sm mb-3" value="{{ $contest->bot_count??0 }}" min="0">

                        <label class="form-label small fw-semibold">Joining Time</label>
                        <div class="mb-2">
                            <div class="form-check">
                                <input class="form-check-input" type="radio" name="bot_time_type" id="botTimeAuto" value="auto" {{ empty($contest->bot_join_at)?'checked':'' }} onchange="toggleBotTime()">
                                <label class="form-check-label small" for="botTimeAuto">X minutes before start</label>
                            </div>
                            <div class="form-check">
                                <input class="form-check-input" type="radio" name="bot_time_type" id="botTimeExact" value="exact" {{ !empty($contest->bot_join_at)?'checked':'' }} onchange="toggleBotTime()">
                                <label class="form-check-label small" for="botTimeExact">Exact date & time</label>
                            </div>
                            <div class="form-check">
                                <input class="form-check-input" type="radio" name="bot_time_type" id="botTimeJoining" value="joining" onchange="toggleBotTime()">
                                <label class="form-check-label small" for="botTimeJoining">Session joining start time</label>
                            </div>
                        </div>
                        <div id="botMinutesBox" {{ !empty($contest->bot_join_at)?'class="d-none"':'' }}>
                            <input type="number" name="bot_join_minutes_before" class="form-control form-control-sm" value="{{ $contest->bot_join_minutes_before??30 }}" min="1">
                        </div>
                        <div id="botExactBox" class="{{ empty($contest->bot_join_at)?'d-none':'' }}">
                            <input type="datetime-local" name="bot_join_at" class="form-control form-control-sm" value="{{ $contest->bot_join_at ? \Carbon\Carbon::parse($contest->bot_join_at)->format('Y-m-d\TH:i') : '' }}">
                        </div>
                        <div id="botJoiningBox" class="d-none">
                            <small class="text-success"><i class="bi bi-info-circle"></i> Bots join when session joining window opens</small>
                        </div>
                        @if($contest->bots_joined)
                            <small class="text-success d-block mt-2"><i class="bi bi-check-circle"></i> Bots already joined</small>
                        @endif
                    </div>
                </div>
            </div>
        </div>

        <input type="hidden" name="prize_distribution" id="prize_distribution_hidden" value="{{ $contest->prize_distribution ?? '[]' }}">
        <input type="hidden" name="fixed_prize_pool" id="fixed_prize_pool_hidden" value="{{ $contest->prize_pool ?? 0 }}">
        <div class="text-center mt-3 mb-5">
            <button type="submit" class="btn btn-warning btn-lg px-5"><i class="bi bi-check-circle-fill me-2"></i>Update Contest</button>
        </div>
    </form>
</div>

<script id="existingTreeData" type="application/json">@json($existingTree)</script>
@endsection

@section('scripts')
<script>
let treeRowIdx = 0;
const TIERS = {
    10:    [[1,1,30],[2,2,18],[3,3,11],[4,5,13.5],[6,10,27.5]],
    25:    [[1,1,24],[2,2,14],[3,3,9],[4,5,12.375],[6,10,18.125],[11,25,22.5]],
    50:    [[1,1,23],[2,2,13],[3,3,9],[4,5,8.1],[6,10,15],[11,25,16.4],[26,50,15.5]],
    100:   [[1,1,18],[2,2,10],[3,3,8],[4,5,6.576],[6,10,10],[11,25,15.4],[26,50,16.524],[51,100,15.5]],
    250:   [[1,1,14],[2,2,9],[3,3,7],[4,5,5.169],[6,10,8.602],[11,25,13.323],[26,50,13.031],[51,100,13.375],[101,250,16.5]],
    500:   [[1,1,14],[2,2,9],[3,3,7],[4,5,3.1],[6,10,6.628],[11,25,10.576],[26,50,10.102],[51,100,12.469],[101,250,13.625],[251,500,13.5]],
    1000:  [[1,1,12],[2,2,8],[3,3,5],[4,5,2.399],[6,10,4.931],[11,25,9.11],[26,50,8.813],[51,100,10.418],[101,250,11.891],[251,500,12.188],[501,1000,15.25]],
    2500:  [[1,1,10],[2,2,7],[3,3,5],[4,5,1.8],[6,10,3.5],[11,25,7.386],[26,50,7.229],[51,100,8.972],[101,250,10.629],[251,500,11.172],[501,1000,12.562],[1001,2500,14.75]],
    5000:  [[1,1,10],[2,2,7],[3,3,5],[4,5,1.75],[6,10,3],[11,25,5.314],[26,50,5.355],[51,100,7.14],[101,250,8.853],[251,500,9.471],[501,1000,10.961],[1001,2500,12.281],[2501,5000,13.875]],
    10000: [[1,1,10],[2,2,7],[3,3,5],[4,5,1.6],[6,10,2.049],[11,25,4.283],[26,50,4.31],[51,100,5.08],[101,500,8.774],[501,1000,10.365],[1001,2500,12.82],[2501,5000,12.094],[5001,10000,16.625]],
    25000: [[1,1,8],[2,2,6],[3,3,4.5],[4,5,1.4],[6,10,1.7],[11,25,3.164],[26,50,3.422],[51,100,4.229],[101,500,6.262],[501,1000,7.339],[1001,5000,12.172],[5001,10000,12.562],[10001,25000,29.25]],
    50000: [[1,1,8],[2,2,6],[3,3,4.5],[4,5,1.2],[6,10,1.7],[11,25,2.903],[26,50,3.043],[51,100,3.89],[101,500,6.187],[501,1000,6.916],[1001,5000,8.555],[5001,10000,10],[10001,25000,17.431],[25001,50000,19.675]],
    100000:[[1,1,8],[2,2,6],[3,3,4.5],[4,5,1.052],[6,10,1.502],[11,25,2.737],[26,50,2.65],[51,100,3.533],[101,500,5.377],[501,1000,5.1],[1001,5000,7.893],[5001,10000,8.45],[10001,25000,11.031],[25001,50000,12.375],[50001,100000,19.8]],
    250000:[[1,1,6.5],[2,2,5],[3,3,4],[4,5,1.076],[6,10,1.8],[11,25,2.53],[26,50,2.507],[51,100,3.11],[101,500,5],[501,1000,6],[1001,5000,7.075],[5001,10000,7.766],[10001,25000,8.355],[25001,100000,13.281],[100001,250000,26]],
    500000:[[1,1,6.5],[2,2,5],[3,3,4],[4,5,1.005],[6,10,1.673],[11,25,2.831],[26,50,2.375],[51,100,2.9],[101,500,4.6],[501,1000,5.6],[1001,5000,6.788],[5001,10000,7.532],[10001,25000,7.734],[25001,100000,9.312],[100001,250000,12.75],[250001,500000,19.4]],
    1000000:[[1,1,5.5],[2,2,4.2],[3,3,3.5],[4,5,0.941],[6,10,1.621],[11,25,2.194],[26,50,2.159],[51,100,2.812],[101,500,4.538],[501,1000,5.2],[1001,5000,6.555],[5001,10000,7.407],[10001,25000,7.709],[25001,100000,8.945],[100001,250000,11.594],[250001,500000,13.125],[500001,1000000,12]],
};
function isFixed(){const c=document.getElementById('category').value;return c==='guaranteed'||c==='practice';}
function num(id){return parseFloat(document.getElementById(id)?.value)||0;}
function getPrizePool(){if(isFixed())return getTreeTotal();const t=num('participants')*num('entry_fee');return t-(t*num('platform_fee')/100);}
function onCategoryChange(){
    const fixed=isFixed();
    document.getElementById('autoStructureBox').classList.toggle('d-none',fixed);
    document.getElementById('treeStructureBox').classList.toggle('d-none',!fixed);
    recalc();
}
function recalc(){
    const t=num('participants')*num('entry_fee');
    const pf=t*num('platform_fee')/100;
    const pool=getPrizePool();
    const w=Math.max(1,Math.floor(num('participants')*num('winning_percentage')/100));
    document.getElementById('o_totalPool').textContent=t.toFixed(0);
    document.getElementById('o_platformFee').textContent=pf.toFixed(0);
    document.getElementById('o_prizePool').textContent=pool.toFixed(0);
    document.getElementById('o_winners').textContent=w;
    if(!isFixed())regenerateAutoTiers();else updateTreeTotal();
}
function getClosestTierKey(n){const keys=Object.keys(TIERS).map(Number).sort((a,b)=>a-b);let chosen=keys[0];let minDiff=Math.abs(keys[0]-n);for(const k of keys){const diff=Math.abs(k-n);if(diff<minDiff){minDiff=diff;chosen=k;}}return chosen;}
function regenerateAutoTiers(){
    const pool=getPrizePool();const winners=Math.max(1,Math.floor(num('participants')*num('winning_percentage')/100));
    const tbody=document.getElementById('autoTiersBody');tbody.innerHTML='';
    if(pool<=0||winners<=0)return;
    const cat=document.getElementById('category').value;
    // Equal: single row all winners
    if(cat==='equal'){
        const pw=Math.floor(pool/winners);
        const tr=document.createElement('tr');
        tr.innerHTML=`<td>Rank 1–${winners}</td><td>${winners}</td><td>100%</td><td class="fw-bold text-success">${pw}</td><td>${Math.floor(pool)}</td>`;
        tbody.appendChild(tr);
        document.getElementById('autoTotal').textContent=Math.floor(pool);
        const dist=[{label:`Rank 1 to ${winners}`,rank_start:1,rank_end:winners,winners:winners,percent:100,prize:pool,per_winner:pw}];
        document.getElementById('prize_distribution_hidden').value=JSON.stringify(dist);
        return;
    }
    const key=getClosestTierKey(winners);
    const isHigher=key>winners;
    const tiers=TIERS[key];let total=0;const dist=[];
    tiers.forEach(([s,e,pct],idx)=>{
        if(s>winners)return;
        const isLast=(idx===tiers.length-1);
        let end;
        if(isLast){end=isHigher?Math.min(e,winners):winners;}
        else{end=Math.min(e,winners);}
        if(end<s)return;
        const cnt=end-s+1;
        const gp=pool*pct/100;
        // Smart last slab: keep per_winner same as structure when higher chosen
        let pw;
        if(isLast||end>=winners){
            const origLast=tiers[tiers.length-1];
            const structWin=origLast[1]-origLast[0]+1;
            const divisor=cnt<=structWin?structWin:cnt;
            pw=gp/divisor;
        }else{pw=gp/cnt;}
        total+=gp;
        const tr=document.createElement('tr');
        tr.innerHTML=`<td>Rank ${s}${end>s?'–'+end:''}</td><td>${cnt}</td><td>${pct}%</td><td class="fw-bold text-success">${Math.floor(pw)}</td><td>${Math.floor(gp)}</td>`;
        tbody.appendChild(tr);
        dist.push({label:`Rank ${s} to ${end}`,rank_start:s,rank_end:end,winners:cnt,percent:pct,prize:gp,per_winner:Math.floor(pw)});
    });
    // Extra winners beyond tier table (only for LOWER structure)
    if(!isHigher){
        const lastD=dist[dist.length-1];
        if(lastD&&lastD.rank_end<winners){
            const es=lastD.rank_end+1,ee=winners,ec=ee-es+1;
            const lastPct=tiers[tiers.length-1][2];
            const egp=pool*lastPct/100,epw=egp/ec;total+=egp;
            const tr=document.createElement('tr');
            tr.innerHTML=`<td>Rank ${es}–${ee}</td><td>${ec}</td><td>${lastPct}%</td><td class="fw-bold text-success">${Math.floor(epw)}</td><td>${Math.floor(egp)}</td>`;
            tbody.appendChild(tr);
            dist.push({label:`Rank ${es} to ${ee}`,rank_start:es,rank_end:ee,winners:ec,percent:lastPct,prize:egp,per_winner:Math.floor(epw)});
        }
    }
    document.getElementById('autoTotal').textContent=Math.floor(total);
    document.getElementById('prize_distribution_hidden').value=JSON.stringify(dist);
}
function addTreeRow(rs='',re='',pw=''){
    treeRowIdx++;const tr=document.createElement('tr');tr.id='tr_'+treeRowIdx;
    tr.innerHTML=`<td><input type="number" class="form-control form-control-sm tr-start" min="1" value="${rs}" oninput="updateTreeTotal()"></td><td><input type="number" class="form-control form-control-sm tr-end" min="1" value="${re}" oninput="updateTreeTotal()"></td><td><span class="tr-winners badge bg-secondary">0</span></td><td><input type="number" class="form-control form-control-sm tr-pw" min="0" step="0.01" value="${pw}" oninput="updateTreeTotal()"></td><td><span class="tr-sub">0</span></td><td><button type="button" class="btn btn-sm btn-outline-danger" onclick="document.getElementById('tr_${treeRowIdx}').remove();updateTreeTotal()"><i class="bi bi-x"></i></button></td>`;
    document.getElementById('treeBody').appendChild(tr);updateTreeTotal();
}
function getTreeTotal(){
    let total=0;
    document.querySelectorAll('#treeBody tr').forEach(tr=>{
        const s=parseInt(tr.querySelector('.tr-start')?.value)||0;const e=parseInt(tr.querySelector('.tr-end')?.value)||0;
        const pw=parseFloat(tr.querySelector('.tr-pw')?.value)||0;const w=(e>=s&&s>0)?(e-s+1):0;const sub=w*pw;
        if(tr.querySelector('.tr-winners'))tr.querySelector('.tr-winners').textContent=w;
        if(tr.querySelector('.tr-sub'))tr.querySelector('.tr-sub').textContent=sub.toFixed(0);
        total+=sub;
    });return total;
}
function updateTreeTotal(){
    const total=getTreeTotal();
    document.getElementById('treeTotal').textContent=total.toFixed(0);
    document.getElementById('fixed_prize_pool_hidden').value=total.toFixed(2);
    document.getElementById('o_prizePool').textContent=total.toFixed(0);
    const dist=[];
    document.querySelectorAll('#treeBody tr').forEach(tr=>{
        const s=parseInt(tr.querySelector('.tr-start')?.value)||0;const e=parseInt(tr.querySelector('.tr-end')?.value)||0;
        const pw=parseFloat(tr.querySelector('.tr-pw')?.value)||0;
        if(s>0&&e>=s&&pw>0){const w=e-s+1;dist.push({label:`Rank ${s} to ${e}`,rank_start:s,rank_end:e,winners:w,per_winner:pw,prize:w*pw,percent:0});}
    });
    document.getElementById('prize_distribution_hidden').value=JSON.stringify(dist);
}
function toggleBotTime(){
    const val=document.querySelector('input[name="bot_time_type"]:checked')?.value;
    document.getElementById('botMinutesBox').classList.toggle('d-none',val!=='auto');
    document.getElementById('botExactBox').classList.toggle('d-none',val!=='exact');
    document.getElementById('botJoiningBox').classList.toggle('d-none',val!=='joining');
}
document.addEventListener('DOMContentLoaded',function(){
    onCategoryChange();
    try{
        const existing=JSON.parse(document.getElementById('existingTreeData').textContent);
        if(Array.isArray(existing)&&existing.length&&isFixed()){
            existing.forEach(r=>addTreeRow(r.rank_start??'',r.rank_end??'',r.per_winner??r.perWinner??''));
        }
    }catch(e){}
    recalc();
});
</script>
@endsection
