@extends('admin.layouts.app')

@section('content')
<div class="min-vh-100" style="background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 50%, #fdcb6e 100%);">
    <div class="container-fluid py-4">
        <div class="row">
            <!-- Main Form -->
            <div class="col-lg-8">
                <div class="card border-0 shadow-lg" style="border-radius: 20px; backdrop-filter: blur(10px); background: rgba(255,255,255,0.95);">
                    <div class="card-header border-0 text-center py-4" style="background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%); border-radius: 20px 20px 0 0;">
                        <h2 class="mb-0 text-white" style="font-weight: 700; letter-spacing: 1px;">
                            <i class="bi bi-trophy-fill me-2"></i>Create New Contest
                        </h2>
                        <p class="mb-0 text-white opacity-75">Set up a new trading contest with prize distribution</p>
                    </div>
                    
                    @if ($errors->any())
                        <div class="alert alert-danger mx-4 mt-4 border-0" style="border-radius: 12px;">
                            <h6 class="alert-heading"><i class="bi bi-exclamation-triangle-fill me-2"></i>Please fix the following errors:</h6>
                            <ul class="mb-0">
                                @foreach ($errors->all() as $error)
                                    <li>{{ $error }}</li>
                                @endforeach
                            </ul>
                        </div>
                    @endif

                    <div class="card-body p-4">
                        <form id="createContestForm" method="POST" action="{{ route('admin.contests.store') }}">
                            @csrf
                            
                            <!-- Basic Information -->
                            <div class="row mb-4">
                                <div class="col-12">
                                    <h5 class="text-warning mb-3" style="font-weight: 600;">
                                        <i class="bi bi-info-circle-fill me-2"></i>Basic Information
                                    </h5>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label for="league_session_id" class="form-label fw-semibold text-dark">
                                        <i class="bi bi-calendar-event me-1"></i>Session
                                    </label>
                                    <select id="league_session_id" name="league_session_id" class="form-select form-select-lg" style="border-radius: 12px;" required>
                                        <option value="">Select Session</option>
                                        @foreach($sessions as $session)
                                            <option value="{{ $session->id }}">{{ $session->name }}</option>
                                        @endforeach
                                    </select>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label for="category" class="form-label fw-semibold text-dark">
                                        <i class="bi bi-tag me-1"></i>Category
                                    </label>
                                    <select id="category" name="category" class="form-select form-select-lg" style="border-radius: 12px;" required>
                                        <option value="mega">Mega Contest</option>
                                        <option value="equal">Equal Prize Contest</option>
                                        <option value="practice">Practice</option>
                                    </select>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label for="max_entries_per_user" class="form-label fw-semibold text-dark">
                                        <i class="bi bi-person-check me-1"></i>Max Entries Per User
                                    </label>
                                    <input type="number" id="max_entries_per_user" name="max_entries_per_user" class="form-control form-control-lg" style="border-radius: 12px;" value="1" min="1" placeholder="How many times can a user join?" required>
                                </div>
                            </div>

                            <!-- Contest Parameters -->
                            <div class="row mb-4">
                                <div class="col-12">
                                    <h5 class="text-warning mb-3" style="font-weight: 600;">
                                        <i class="bi bi-calculator-fill me-2"></i>Contest Parameters
                                    </h5>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label for="participants" class="form-label fw-semibold text-dark">
                                        <i class="bi bi-people me-1"></i>Number of Participants (N)
                                    </label>
                                    <input type="number" id="participants" name="participants" class="form-control form-control-lg" style="border-radius: 12px;" value="100" min="1" placeholder="Enter number of participants" required>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label for="entryFee" class="form-label fw-semibold text-dark">
                                        <i class="bi bi-coin me-1"></i>Entry Fee (E)
                                    </label>
                                    <div class="input-group">
                                        <input type="number" id="entryFee" name="entry_fee" class="form-control form-control-lg" style="border-radius: 12px 0 0 12px;" value="10" min="1" placeholder="Enter entry fee per participant" required>
                                        <span class="input-group-text" style="border-radius: 0 12px 12px 0; background: #f39c12; color: white; border: none;">probcoins</span>
                                    </div>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label for="platformFee" class="form-label fw-semibold text-dark">
                                        <i class="bi bi-percent me-1"></i>Platform Fee % (F)
                                    </label>
                                    <input type="number" id="platformFee" name="platform_fee" class="form-control form-control-lg" style="border-radius: 12px;" value="10" min="0" max="100" step="0.1" placeholder="Enter platform fee percentage" required>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label for="winningPercentage" class="form-label fw-semibold text-dark">
                                        <i class="bi bi-trophy me-1"></i>Winning Percentage
                                    </label>
                                    <div class="input-group">
                                        <input type="number" id="winningPercentage" name="winning_percentage" class="form-control form-control-lg" style="border-radius: 12px 0 0 12px;" value="30" min="0" max="100" step="0.1" placeholder="% of participants who win">
                                        <span class="input-group-text" style="border-radius: 0 12px 12px 0; background: #f39c12; color: white; border: none;">%</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Live Calculator Display -->
                            <div class="row mb-4">
                                <div class="col-12">
                                    <div class="card border-0" style="background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%); border-radius: 15px;">
                                        <div class="card-body p-4">
                                            <h6 class="text-warning mb-3" style="font-weight: 600;">
                                                <i class="bi bi-calculator me-2"></i>Live Calculations
                                            </h6>
                                            <div class="row text-center">
                                                <div class="col-md-3 mb-2">
                                                    <div class="p-2 bg-white rounded" style="border-radius: 10px;">
                                                        <small class="text-muted d-block">Total Pool</small>
                                                        <strong class="text-success" id="totalPool">0 probcoins</strong>
                                                    </div>
                                                </div>
                                                <div class="col-md-3 mb-2">
                                                    <div class="p-2 bg-white rounded" style="border-radius: 10px;">
                                                        <small class="text-muted d-block">Platform Fee</small>
                                                        <strong class="text-danger" id="platformFeeAmount">0 probcoins</strong>
                                                    </div>
                                                </div>
                                                <div class="col-md-3 mb-2">
                                                    <div class="p-2 bg-white rounded" style="border-radius: 10px;">
                                                        <small class="text-muted d-block">Prize Pool</small>
                                                        <strong class="text-primary" id="prizePool">0 probcoins</strong>
                                                    </div>
                                                </div>
                                                <div class="col-md-3 mb-2">
                                                    <div class="p-2 bg-white rounded" style="border-radius: 10px;">
                                                        <small class="text-muted d-block">Total Winners</small>
                                                        <strong class="text-warning" id="totalWinnersCount">0</strong>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Prize Distribution -->
                            <div class="mb-4">
                                <h5 class="text-warning mb-3" style="font-weight: 600;">
                                    <i class="bi bi-award-fill me-2"></i>Prize Distribution
                                </h5>
                                <div class="card border-0" style="background: #f8f9fa; border-radius: 15px;">
                                    <div class="card-body p-4">
                                        <div id="prizeDistributionInputs" class="mb-3"></div>
                                        <div id="totalPercentageWarning" class="mt-2 text-danger fw-bold"></div>
                                        <div id="result" class="mt-3"></div>
                                        <ul id="distributionResult" class="list-group mt-2"></ul>
                                        <button type="button" class="btn btn-outline-warning mt-3" id="showPrizeJsonBtn" style="border-radius: 10px;">
                                            <i class="bi bi-code-square me-1"></i>Show Prize Distribution JSON
                                        </button>
                                        <input type="hidden" name="prize_distribution" id="prize_distribution_hidden" value="[]">
                                    </div>
                                </div>
                            </div>

                            <div class="text-center">
                                <button type="submit" class="btn btn-lg px-5 py-3" style="background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%); border: none; border-radius: 15px; color: white; font-weight: 600; letter-spacing: 1px; box-shadow: 0 4px 15px rgba(243,156,18,0.3);">
                                    <i class="bi bi-plus-circle-fill me-2"></i>Create Contest
                                </button>
                            </div>
                            <div id="prizeDistributionDebugContainer"></div>
                        </form>
                    </div>
                </div>
            </div>

            <!-- Guidelines Sidebar -->
            <div class="col-lg-4">
                <div class="card border-0 shadow-lg" style="border-radius: 20px; backdrop-filter: blur(10px); background: rgba(255,255,255,0.95);">
                    <div class="card-header border-0 text-center py-3" style="background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%); border-radius: 20px 20px 0 0;">
                        <h5 class="mb-0 text-white" style="font-weight: 600;">
                            <i class="bi bi-lightbulb-fill me-2"></i>Contest Guidelines
                        </h5>
                    </div>
                    <div class="card-body p-4">
                        <div class="mb-4">
                            <h6 class="text-warning mb-2" style="font-weight: 600;">
                                <i class="bi bi-info-circle me-1"></i>Contest Categories
                            </h6>
                            <ul class="list-unstyled small text-muted">
                                <li class="mb-1"><strong>Mega Contest:</strong> Large prize pools, many participants</li>
                                <li class="mb-1"><strong>Equal Prize:</strong> All winners get equal prizes</li>
                                <li class="mb-1"><strong>Practice:</strong> Free contests for learning</li>
                            </ul>
                        </div>
                        
                        <div class="mb-4">
                            <h6 class="text-warning mb-2" style="font-weight: 600;">
                                <i class="bi bi-calculator me-1"></i>Prize Calculation
                            </h6>
                            <ul class="list-unstyled small text-muted">
                                <li class="mb-1">• Total Pool = Participants × Entry Fee</li>
                                <li class="mb-1">• Platform Fee = Total Pool × Platform Fee %</li>
                                <li class="mb-1">• Prize Pool = Total Pool - Platform Fee</li>
                                <li class="mb-1">• Winners = Participants × Winning %</li>
                            </ul>
                        </div>
                        
                        <div class="mb-4">
                            <h6 class="text-warning mb-2" style="font-weight: 600;">
                                <i class="bi bi-award me-1"></i>Prize Distribution Tips
                            </h6>
                            <ul class="list-unstyled small text-muted">
                                <li class="mb-1">• Total percentages must equal 100%</li>
                                <li class="mb-1">• Higher ranks get larger prize percentages</li>
                                <li class="mb-1">• Consider 50-30-20 distribution for top 3</li>
                                <li class="mb-1">• Equal prizes work well for practice contests</li>
                            </ul>
                        </div>
                        
                        <div class="mb-4">
                            <h6 class="text-warning mb-2" style="font-weight: 600;">
                                <i class="bi bi-shield-check me-1"></i>Best Practices
                            </h6>
                            <ul class="list-unstyled small text-muted">
                                <li class="mb-1">• Set reasonable entry fees</li>
                                <li class="mb-1">• Keep platform fees competitive</li>
                                <li class="mb-1">• Test with practice contests first</li>
                                <li class="mb-1">• Monitor participant engagement</li>
                            </ul>
                        </div>
                        
                        <div class="alert alert-warning border-0" style="border-radius: 12px; background: rgba(255,193,7,0.1);">
                            <small>
                                <i class="bi bi-exclamation-triangle me-1"></i>
                                <strong>Note:</strong> All calculations are performed in real-time. Ensure your prize distribution adds up to 100% before creating the contest.
                            </small>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
@endsection






