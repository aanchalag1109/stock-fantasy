@extends('admin.layouts.app')

@section('title', 'Pending Prize Distribution')

@section('content')
<div class="container-fluid py-4">
    <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
            <h3 class="mb-1"><i class="bi bi-trophy text-warning"></i> Prize Distribution</h3>
            <p class="text-muted mb-0">Manually distribute prizes to contest winners</p>
        </div>
    </div>

    <!-- Filters -->
    <div class="card mb-4">
        <div class="card-body py-2">
            <div class="d-flex align-items-center gap-3 flex-wrap">
                <strong>Filter:</strong>
                <a href="?filter=pending&days={{ $days }}" class="btn btn-sm {{ $filter === 'pending' ? 'btn-warning' : 'btn-outline-warning' }}">
                    <i class="bi bi-clock"></i> Pending Only
                </a>
                <a href="?filter=paid&days={{ $days }}" class="btn btn-sm {{ $filter === 'paid' ? 'btn-success' : 'btn-outline-success' }}">
                    <i class="bi bi-check-circle"></i> Paid Only
                </a>
                <a href="?filter=all&days={{ $days }}" class="btn btn-sm {{ $filter === 'all' ? 'btn-primary' : 'btn-outline-primary' }}">
                    <i class="bi bi-list"></i> All
                </a>

                <span class="ms-3"><strong>Days:</strong></span>
                <a href="?filter={{ $filter }}&days=1" class="btn btn-sm {{ $days == 1 ? 'btn-dark' : 'btn-outline-dark' }}">Today</a>
                <a href="?filter={{ $filter }}&days=3" class="btn btn-sm {{ $days == 3 ? 'btn-dark' : 'btn-outline-dark' }}">3 Days</a>
                <a href="?filter={{ $filter }}&days=7" class="btn btn-sm {{ $days == 7 ? 'btn-dark' : 'btn-outline-dark' }}">7 Days</a>
                <a href="?filter={{ $filter }}&days=30" class="btn btn-sm {{ $days == 30 ? 'btn-dark' : 'btn-outline-dark' }}">30 Days</a>
            </div>
        </div>
    </div>

    @if(empty($pendingSessions))
        <div class="alert alert-info text-center py-4">
            <i class="bi bi-info-circle display-6 d-block mb-2"></i>
            <h5>No contests found for this filter</h5>
            <p class="mb-0">Try changing the filter or date range.</p>
        </div>
    @endif

    @foreach($pendingSessions as $data)
        @php
            $session = $data['session'];
            $contests = $data['contests'];
            $hasPending = $data['has_pending'];
        @endphp

        <div class="card mb-3 shadow-sm">
            <div class="card-header d-flex justify-content-between align-items-center py-2">
                <div>
                    <h6 class="mb-0">
                        {{ $session->name ?? 'Session #'.$session->id }}
                        <small class="text-muted ms-2">
                            {{ \Carbon\Carbon::parse($session->start_time)->format('M d, H:i') }} - 
                            {{ \Carbon\Carbon::parse($session->end_time)->format('H:i') }}
                            | {{ $session->market_type ?? 'stock' }}
                        </small>
                    </h6>
                </div>
                @if($hasPending)
                <button class="btn btn-warning btn-sm" onclick="distributeSession({{ $session->id }}, this)">
                    <i class="bi bi-lightning-charge"></i> Distribute All
                </button>
                @endif
            </div>

            <div class="table-responsive">
                <table class="table table-sm table-hover mb-0 align-middle">
                    <thead class="table-light">
                        <tr>
                            <th>ID</th>
                            <th>Type</th>
                            <th>Entry</th>
                            <th>Pool</th>
                            <th>Players</th>
                            <th>Paid</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        @foreach($contests as $contest)
                        <tr id="row-{{ $contest['id'] }}">
                            <td><strong>#{{ $contest['id'] }}</strong></td>
                            <td>
                                @php
                                    $badgeClass = match($contest['category']) {
                                        'mega' => 'bg-primary',
                                        'practice' => 'bg-info',
                                        'guaranteed' => 'bg-success',
                                        default => 'bg-secondary'
                                    };
                                @endphp
                                <span class="badge {{ $badgeClass }}">{{ strtoupper($contest['category']) }}</span>
                            </td>
                            <td>₹{{ $contest['entry_fee'] }}</td>
                            <td class="fw-bold text-success">₹{{ number_format($contest['prize_pool']) }}</td>
                            <td>{{ $contest['participants'] }}</td>
                            <td>
                                @if($contest['is_paid'])
                                    <span class="text-success fw-bold">₹{{ number_format($contest['total_winnings_paid']) }}</span>
                                    <br><small class="text-muted">{{ $contest['winners_count'] }} winners</small>
                                @else
                                    <span class="text-muted">—</span>
                                @endif
                            </td>
                            <td>
                                @if($contest['is_paid'])
                                    <span class="badge bg-success"><i class="bi bi-check"></i> Paid</span>
                                @else
                                    <span class="badge bg-warning text-dark"><i class="bi bi-clock"></i> Pending</span>
                                @endif
                            </td>
                            <td>
                                @if(!$contest['is_paid'])
                                <button class="btn btn-sm btn-outline-success" onclick="distributeContest({{ $contest['id'] }}, this)">
                                    <i class="bi bi-wallet2"></i> Pay
                                </button>
                                @else
                                <span class="text-success"><i class="bi bi-check-lg"></i></span>
                                @endif
                            </td>
                        </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>
        </div>
    @endforeach
</div>

<!-- Modal -->
<div class="modal fade" id="resultModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="resultModalTitle"></h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body" id="resultModalBody"></div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div>
@endsection

@section('scripts')
<script>
function distributeContest(id, btn) {
    if (!confirm('Contest #' + id + ' ke winners ko prize distribute karna hai?')) return;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

    fetch('/admin/pending-prizes/distribute-contest/' + id, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content }
    })
    .then(r => r.json())
    .then(data => {
        showResult(data.success ? '✅ Done' : '⚠️ Info', data.message);
        if (data.success) {
            btn.outerHTML = '<span class="text-success"><i class="bi bi-check-lg"></i></span>';
            let row = document.getElementById('row-' + id);
            if (row) row.querySelector('td:nth-child(7)').innerHTML = '<span class="badge bg-success"><i class="bi bi-check"></i> Paid</span>';
        } else {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-wallet2"></i> Pay';
        }
    })
    .catch(e => { btn.disabled = false; btn.innerHTML = '<i class="bi bi-wallet2"></i> Pay'; showResult('❌ Error', e.message); });
}

function distributeSession(id, btn) {
    if (!confirm('Session ke SABHI pending contests distribute karna hai?')) return;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Processing...';

    fetch('/admin/pending-prizes/distribute-session/' + id, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content }
    })
    .then(r => r.json())
    .then(data => {
        showResult(data.success ? '✅ Done' : '⚠️ Info', data.message);
        if (data.success) setTimeout(() => location.reload(), 1500);
        else { btn.disabled = false; btn.innerHTML = '<i class="bi bi-lightning-charge"></i> Distribute All'; }
    })
    .catch(e => { btn.disabled = false; btn.innerHTML = '<i class="bi bi-lightning-charge"></i> Distribute All'; showResult('❌ Error', e.message); });
}

function showResult(title, msg) {
    document.getElementById('resultModalTitle').textContent = title;
    document.getElementById('resultModalBody').innerHTML = '<p>' + msg + '</p>';
    new bootstrap.Modal(document.getElementById('resultModal')).show();
}
</script>
@endsection
