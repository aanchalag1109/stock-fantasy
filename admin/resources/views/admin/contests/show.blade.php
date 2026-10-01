@extends('admin.layouts.app')

@section('content')
<div class="min-vh-100" style="background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 50%, #90caf9 100%);">
    <div class="container-fluid py-4">
        <div class="row">
            <!-- Main Content -->
            <div class="col-lg-8">
                <div class="card border-0 shadow-lg" style="border-radius: 20px; backdrop-filter: blur(10px); background: rgba(255,255,255,0.95);">
                    <div class="card-header border-0 text-center py-4" style="background: linear-gradient(135deg, #2196f3 0%, #1565c0 100%); border-radius: 20px 20px 0 0;">
                        <h2 class="mb-0 text-white" style="font-weight: 700; letter-spacing: 1px;">
                            <i class="bi bi-eye me-2"></i>Contest Details
                        </h2>
                        <p class="mb-0 text-white opacity-75">View contest settings and prize distribution</p>
                    </div>

                    <div class="card-body p-4">
                        <!-- Basic Information -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h5 class="text-primary mb-3" style="font-weight: 600;">
                                    <i class="bi bi-info-circle-fill me-2"></i>Basic Information
                                </h5>
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label fw-semibold text-dark">
                                    <i class="bi bi-calendar-event me-1"></i>Session
                                </label>
                                <input type="text" class="form-control form-control-lg" style="border-radius: 12px;" value="{{ $contest->leagueSession->name ?? 'N/A' }}" readonly>
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label fw-semibold text-dark">
                                    <i class="bi bi-tag me-1"></i>Category
                                </label>
                                <input type="text" class="form-control form-control-lg" style="border-radius: 12px;" value="{{ ucfirst($contest->category) }}" readonly>
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label fw-semibold text-dark">
                                    <i class="bi bi-person-check me-1"></i>Max Entries Per User
                                </label>
                                <input type="text" class="form-control form-control-lg" style="border-radius: 12px;" value="{{ $contest->max_entries_per_user ?? 1 }}" readonly>
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label fw-semibold text-dark">
                                    <i class="bi bi-flag me-1"></i>Status
                                </label>
                                <input type="text" class="form-control form-control-lg" style="border-radius: 12px;" value="{{ ucfirst($contest->status) }}" readonly>
                            </div>
                        </div>

                        <!-- Contest Parameters -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h5 class="text-primary mb-3" style="font-weight: 600;">
                                    <i class="bi bi-calculator-fill me-2"></i>Contest Parameters
                                </h5>
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label fw-semibold text-dark">
                                    <i class="bi bi-people me-1"></i>Number of Participants
                                </label>
                                <input type="text" class="form-control form-control-lg" style="border-radius: 12px;" value="{{ $contest->participants }}" readonly>
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label fw-semibold text-dark">
                                    <i class="bi bi-coin me-1"></i>Entry Fee
                                </label>
                                <div class="input-group">
                                    <input type="text" class="form-control form-control-lg" style="border-radius: 12px 0 0 12px;" value="{{ number_format($contest->entry_fee, 0) }}" readonly>
                                    <span class="input-group-text" style="border-radius: 0 12px 12px 0; background: #2196f3; color: white; border: none;">probcoins</span>
                                </div>
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label fw-semibold text-dark">
                                    <i class="bi bi-percent me-1"></i>Platform Fee %
                                </label>
                                <input type="text" class="form-control form-control-lg" style="border-radius: 12px;" value="{{ $contest->platform_fee }}%" readonly>
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label fw-semibold text-dark">
                                    <i class="bi bi-trophy me-1"></i>Winning Percentage
                                </label>
                                <div class="input-group">
                                    <input type="text" class="form-control form-control-lg" style="border-radius: 12px 0 0 12px;" value="{{ $contest->winning_percentage }}" readonly>
                                    <span class="input-group-text" style="border-radius: 0 12px 12px 0; background: #2196f3; color: white; border: none;">%</span>
                                </div>
                            </div>
                        </div>

                        <!-- Calculations Display -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <div class="card border-0" style="background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); border-radius: 15px;">
                                    <div class="card-body p-4">
                                        <h6 class="text-primary mb-3" style="font-weight: 600;">
                                            <i class="bi bi-calculator me-2"></i>Calculated Values
                                        </h6>
                                        <div class="row text-center">
                                            <div class="col-md-3 mb-2">
                                                <div class="p-2 bg-white rounded" style="border-radius: 10px;">
                                                    <small class="text-muted d-block">Total Pool</small>
                                                    <strong class="text-success">{{ number_format($contest->total_pool, 0) }} probcoins</strong>
                                                </div>
                                            </div>
                                            <div class="col-md-3 mb-2">
                                                <div class="p-2 bg-white rounded" style="border-radius: 10px;">
                                                    <small class="text-muted d-block">Platform Fee</small>
                                                    <strong class="text-danger">{{ number_format($contest->platform_fee_amount, 0) }} probcoins</strong>
                                                </div>
                                            </div>
                                            <div class="col-md-3 mb-2">
                                                <div class="p-2 bg-white rounded" style="border-radius: 10px;">
                                                    <small class="text-muted d-block">Prize Pool</small>
                                                    <strong class="text-primary">{{ number_format($contest->prize_pool, 0) }} probcoins</strong>
                                                </div>
                                            </div>
                                            <div class="col-md-3 mb-2">
                                                <div class="p-2 bg-white rounded" style="border-radius: 10px;">
                                                    <small class="text-muted d-block">Total Winners</small>
                                                    <strong class="text-warning">{{ $contest->total_winners }}</strong>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Prize Distribution -->
                        @if(!empty($contest->prize_distribution))
                        <div class="mb-4">
                            <h5 class="text-primary mb-3" style="font-weight: 600;">
                                <i class="bi bi-award-fill me-2"></i>Prize Distribution
                            </h5>
                            <div class="card border-0" style="background: #e8f5e8; border-radius: 15px;">
                                <div class="card-body p-4">
                                    @php
                                        $prizes = json_decode($contest->prize_distribution, true);
                                    @endphp
                                    @if(is_array($prizes))
                                        <div class="row">
                                            @foreach($prizes as $prize)
                                                <div class="col-md-4 mb-3">
                                                    <div class="p-3 bg-white rounded shadow-sm" style="border-radius: 10px;">
                                                        <div class="d-flex justify-content-between align-items-center mb-2">
                                                            <span class="badge bg-primary">{{ $prize['label'] ?? 'Rank' }}</span>
                                                            <span class="badge bg-success">{{ $prize['percent'] ?? 0 }}%</span>
                                                        </div>
                                                        <div class="text-center">
                                                            <h4 class="text-success mb-0">{{ number_format($prize['prize'] ?? 0, 0) }}</h4>
                                                            <small class="text-muted">probcoins</small>
                                                        </div>
                                                        <div class="text-center mt-2">
                                                            <small class="text-muted">{{ $prize['winners'] ?? 1 }} winner(s)</small><br>
                                                            <small class="text-success fw-bold">{{ number_format($prize['perWinner'] ?? 0, 0) }} per winner</small>
                                                        </div>
                                                    </div>
                                                </div>
                                            @endforeach
                                        </div>
                                    @else
                                        <div class="text-danger">Prize distribution data is invalid.</div>
                                    @endif
                                </div>
                            </div>
                        </div>
                        @endif

                        <div class="text-center">
                            <a href="{{ route('admin.contests.index') }}" class="btn btn-lg px-5 py-3" style="background: linear-gradient(135deg, #2196f3 0%, #1565c0 100%); border: none; border-radius: 15px; color: white; font-weight: 600; letter-spacing: 1px; box-shadow: 0 4px 15px rgba(33,150,243,0.3);">
                                <i class="bi bi-arrow-left me-2"></i>Back to Contests
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Info Sidebar -->
            <div class="col-lg-4">
                <div class="card border-0 shadow-lg" style="border-radius: 20px; backdrop-filter: blur(10px); background: rgba(255,255,255,0.95);">
                    <div class="card-header border-0 text-center py-3" style="background: linear-gradient(135deg, #2196f3 0%, #1565c0 100%); border-radius: 20px 20px 0 0;">
                        <h5 class="mb-0 text-white" style="font-weight: 600;">
                            <i class="bi bi-info-circle-fill me-2"></i>Contest Information
                        </h5>
                    </div>
                    <div class="card-body p-4">
                        <div class="mb-4">
                            <h6 class="text-primary mb-2" style="font-weight: 600;">
                                <i class="bi bi-clock-history me-1"></i>Timeline
                            </h6>
                            <ul class="list-unstyled small text-muted">
                                <li class="mb-2">
                                    <strong>Created:</strong><br>
                                    {{ $contest->created_at->format('M d, Y h:i A') }}
                                </li>
                                <li class="mb-2">
                                    <strong>Last Updated:</strong><br>
                                    {{ $contest->updated_at->format('M d, Y h:i A') }}
                                </li>
                            </ul>
                        </div>

                        <div class="mb-4">
                            <h6 class="text-primary mb-2" style="font-weight: 600;">
                                <i class="bi bi-people me-1"></i>Participation
                            </h6>
                            <ul class="list-unstyled small text-muted">
                                <li class="mb-1">• Max Participants: {{ $contest->participants }}</li>
                                <li class="mb-1">• Joined: {{ $stats['total_participants'] ?? 0 }}</li>
                                <li class="mb-1">• Available Spots: {{ $contest->participants - ($stats['total_participants'] ?? 0) }}</li>
                            </ul>
                        </div>

                        <div class="alert alert-info border-0" style="border-radius: 12px; background: rgba(33,150,243,0.1);">
                            <small>
                                <i class="bi bi-info-circle me-1"></i>
                                <strong>Note:</strong> This is a read-only view. To make changes, use the Edit button from the contests list.
                            </small>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
@endsection
