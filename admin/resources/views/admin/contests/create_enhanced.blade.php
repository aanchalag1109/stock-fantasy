@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <!-- Header Section -->
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-1"><i class="bi bi-plus-circle-fill text-warning me-2"></i>Create New Contest</h1>
            <p class="text-muted mb-0">Set up a new trading contest with prizes and rules</p>
        </div>
        <a href="{{ route('admin.contests.index') }}" class="btn btn-outline-secondary">
            <i class="bi bi-arrow-left me-1"></i>Back to Contests
        </a>
    </div>

    @if ($errors->any())
        <div class="alert alert-danger border-0 shadow-sm mb-4">
            <i class="bi bi-exclamation-triangle-fill me-2"></i>
            <strong>Please fix the following errors:</strong>
            <ul class="mb-0 mt-2">
                @foreach ($errors->all() as $error)
                    <li>{{ $error }}</li>
                @endforeach
            </ul>
        </div>
    @endif

    <div class="row">
        <div class="col-lg-8">
            <div class="card shadow-sm border-0">
                <div class="card-header bg-gradient-warning text-white">
                    <h5 class="mb-0"><i class="bi bi-gear-fill me-2"></i>Contest Configuration</h5>
                </div>
                <div class="card-body p-4">
                    <form id="createContestForm" method="POST" action="{{ route('admin.contests.store') }}">
                        @csrf
                        
                        <!-- Basic Information -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h6 class="text-warning mb-3"><i class="bi bi-info-circle me-2"></i>Basic Information</h6>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="league_session_id" class="form-label fw-semibold">League Session <span class="text-danger">*</span></label>
                                    <select id="league_session_id" name="league_session_id" class="form-select form-select-lg" required>
                                        <option value="">Choose a session</option>
                                        @foreach($sessions as $session)
                                            <option value="{{ $session->id }}">{{ $session->name }}</option>
                                        @endforeach
                                    </select>
                                    <div class="form-text">Select the trading session for this contest</div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="category" class="form-label fw-semibold">Contest Category <span class="text-danger">*</span></label>
                                    <select id="category" name="category" class="form-select form-select-lg" required>
                                        <option value="mega">🏆 Mega Contest</option>
                                        <option value="equal">⚖️ Equal Prize Contest</option>
                                        <option value="practice">🎯 Practice Contest</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <!-- Contest Settings -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h6 class="text-warning mb-3"><i class="bi bi-sliders me-2"></i>Contest Settings</h6>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="participants" class="form-label fw-semibold">Max Participants <span class="text-danger">*</span></label>
                                    <input type="number" id="participants" name="participants" class="form-control form-control-lg" 
                                           value="100" min="2" placeholder="e.g., 100" required>
                                    <div class="form-text">Maximum number of participants allowed</div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="max_entries_per_user" class="form-label fw-semibold">Max Entries Per User</label>
                                    <input type="number" id="max_entries_per_user" name="max_entries_per_user" 
                                           class="form-control form-control-lg" value="1" min="1" max="10">
                                    <div class="form-text">How many times can a user join this contest</div>
                                </div>
                            </div>
                        </div>

                        <!-- Financial Settings -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h6 class="text-warning mb-3"><i class="bi bi-currency-rupee me-2"></i>Financial Settings</h6>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="entryFee" class="form-label fw-semibold">Entry Fee <span class="text-danger">*</span></label>
                                    <div class="input-group">
                                        <span class="input-group-text">₹</span>
                                        <input type="number" id="entryFee" name="entry_fee" class="form-control form-control-lg" 
                                               value="10" min="0" step="0.01" placeholder="10.00" required>
                                    </div>
                                    <div class="form-text">Amount each participant pays to join</div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="platformFee" class="form-label fw-semibold">Platform Fee</label>
                                    <div class="input-group">
                                        <input type="number" id="platformFee" name="platform_fee" class="form-control form-control-lg" 
                                               value="10" min="0" max="50" step="0.1">
                                        <span class="input-group-text">%</span>
                                    </div>
                                    <div class="form-text">Platform commission percentage</div>
                                </div>
                            </div>
                        </div>

                        <!-- Winner Settings -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h6 class="text-warning mb-3"><i class="bi bi-trophy me-2"></i>Winner Settings</h6>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="winningPercentage" class="form-label fw-semibold">Winning Percentage</label>
                                    <div class="input-group">
                                        <input type="number" id="winningPercentage" name="winning_percentage" 
                                               class="form-control form-control-lg" value="50" min="0" max="100" step="1">
                                        <span class="input-group-text">%</span>
                                    </div>
                                    <div class="form-text">Percentage of participants who will win prizes</div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label class="form-label fw-semibold">Total Winners</label>
                                    <div class="form-control form-control-lg bg-light" id="totalWinnersCount">0</div>
                                    <div class="form-text">Calculated based on participants and winning percentage</div>
                                </div>
                            </div>
                        </div>

                        <!-- Prize Distribution -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h6 class="text-warning mb-3"><i class="bi bi-gift me-2"></i>Prize Distribution</h6>
                            </div>
                            <div class="col-12">
                                <div class="card bg-light border-0">
                                    <div class="card-body">
                                        <div id="prizeDistributionInputs" class="mb-3"></div>
                                        <div id="totalPercentageWarning" class="mt-2 text-danger fw-bold"></div>
                                        <div id="result" class="mt-3"></div>
                                        <ul id="distributionResult" class="list-group mt-2"></ul>
                                        <button type="button" class="btn btn-outline-warning mt-3" id="showPrizeJsonBtn">
                                            <i class="bi bi-code-square me-1"></i>Show Prize JSON
                                        </button>
                                        <input type="hidden" name="prize_distribution" id="prize_distribution_hidden" value="[]">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Contest Status -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h6 class="text-warning mb-3"><i class="bi bi-toggles me-2"></i>Contest Status</h6>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="status" class="form-label fw-semibold">Initial Status <span class="text-danger">*</span></label>
                                    <select id="status" name="status" class="form-select form-select-lg" required>
                                        <option value="upcoming" selected>⏰ Upcoming</option>
                                        <option value="live">🔴 Live</option>
                                        <option value="completed">✅ Completed</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <!-- Action Buttons -->
                        <div class="row">
                            <div class="col-12">
                                <div class="d-flex gap-3 justify-content-end">
                                    <a href="{{ route('admin.contests.index') }}" class="btn btn-outline-secondary btn-lg px-4">
                                        <i class="bi bi-x-circle me-2"></i>Cancel
                                    </a>
                                    <button type="submit" class="btn btn-warning btn-lg px-4">
                                        <i class="bi bi-check-circle me-2"></i>Create Contest
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div id="prizeDistributionDebugContainer"></div>
                    </form>
                </div>
            </div>
        </div>
        
        <!-- Guidelines Sidebar -->
        <div class="col-lg-4">
            <div class="card shadow-sm border-0 mb-4">
                <div class="card-header bg-light">
                    <h6 class="mb-0"><i class="bi bi-lightbulb text-warning me-2"></i>Contest Guidelines</h6>
                </div>
                <div class="card-body">
                    <div class="mb-3">
                        <h6 class="text-primary">Contest Categories</h6>
                        <ul class="small text-muted mb-0">
                            <li><strong>Mega:</strong> Large prize pools, many participants</li>
                            <li><strong>Equal Prize:</strong> Same prize for all winners</li>
                            <li><strong>Practice:</strong> Free or low-cost learning contests</li>
                        </ul>
                    </div>
                    <div class="mb-3">
                        <h6 class="text-primary">Prize Distribution</h6>
                        <ul class="small text-muted mb-0">
                            <li>Total prize = (Participants × Entry Fee) - Platform Fee</li>
                            <li>Winners = Participants × Winning Percentage</li>
                            <li>Distribute prizes based on rank ranges</li>
                        </ul>
                    </div>
                    <div class="mb-3">
                        <h6 class="text-primary">Best Practices</h6>
                        <ul class="small text-muted mb-0">
                            <li>Set reasonable entry fees</li>
                            <li>Keep platform fee between 5-15%</li>
                            <li>Winning percentage: 10-50% typical</li>
                            <li>Test with practice contests first</li>
                        </ul>
                    </div>
                </div>
            </div>

            <!-- Live Calculator -->
            <div class="card shadow-sm border-0">
                <div class="card-header bg-light">
                    <h6 class="mb-0"><i class="bi bi-calculator text-info me-2"></i>Live Calculator</h6>
                </div>
                <div class="card-body">
                    <div class="mb-2">
                        <small class="text-muted">Total Collection:</small>
                        <div class="fw-bold text-success" id="totalCollection">₹0</div>
                    </div>
                    <div class="mb-2">
                        <small class="text-muted">Platform Fee:</small>
                        <div class="fw-bold text-warning" id="platformFeeAmount">₹0</div>
                    </div>
                    <div class="mb-2">
                        <small class="text-muted">Prize Pool:</small>
                        <div class="fw-bold text-primary" id="prizePoolAmount">₹0</div>
                    </div>
                    <div class="mb-2">
                        <small class="text-muted">Total Winners:</small>
                        <div class="fw-bold text-info" id="winnersCount">0</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<style>
.bg-gradient-warning {
    background: linear-gradient(135deg, #ffc107 0%, #ff8c00 100%);
}

.card {
    border-radius: 15px;
    transition: all 0.3s ease;
}

.form-control, .form-select {
    border-radius: 10px;
    border: 2px solid #e9ecef;
    transition: all 0.3s ease;
}

.form-control:focus, .form-select:focus {
    border-color: #ffc107;
    box-shadow: 0 0 0 0.2rem rgba(255, 193, 7, 0.25);
}

.btn {
    border-radius: 10px;
    font-weight: 500;
    transition: all 0.3s ease;
}

.btn-warning {
    background: linear-gradient(135deg, #ffc107 0%, #ff8c00 100%);
    border: none;
    color: white;
}

.btn-warning:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(255, 193, 7, 0.4);
    color: white;
}

.text-warning {
    color: #ffc107 !important;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}

.card {
    animation: fadeIn 0.5s ease-out;
}
</style>

<script>
// Live calculator updates
function updateCalculator() {
    const participants = parseInt(document.getElementById('participants').value) || 0;
    const entryFee = parseFloat(document.getElementById('entryFee').value) || 0;
    const platformFeePercent = parseFloat(document.getElementById('platformFee').value) || 0;
    const winningPercent = parseFloat(document.getElementById('winningPercentage').value) || 0;
    
    const totalCollection = participants * entryFee;
    const platformFeeAmount = (totalCollection * platformFeePercent) / 100;
    const prizePool = totalCollection - platformFeeAmount;
    const winners = Math.floor((participants * winningPercent) / 100);
    
    document.getElementById('totalCollection').textContent = '₹' + totalCollection.toLocaleString();
    document.getElementById('platformFeeAmount').textContent = '₹' + platformFeeAmount.toLocaleString();
    document.getElementById('prizePoolAmount').textContent = '₹' + prizePool.toLocaleString();
    document.getElementById('winnersCount').textContent = winners;
    document.getElementById('totalWinnersCount').textContent = winners;
}

// Add event listeners
document.addEventListener('DOMContentLoaded', function() {
    ['participants', 'entryFee', 'platformFee', 'winningPercentage'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateCalculator);
    });
    updateCalculator();
});
</script>
@endsection