@extends('layouts.admin')

@section('content')
<div class="container-fluid py-4">
    <div class="row justify-content-center">
        <div class="col-md-8">
            <div class="card border-warning">
                <div class="card-header bg-warning text-white">
                    <h4 class="mb-0">
                        <i class="fas fa-exclamation-triangle"></i> Contest Cancelled
                    </h4>
                </div>
                <div class="card-body text-center py-5">
                    <i class="fas fa-ban fa-5x text-warning mb-4"></i>
                    <h3 class="mb-3">Contest #{{ $contest->id }} - {{ $contest->category }}</h3>
                    <p class="lead text-muted mb-4">
                        This contest was cancelled due to less than 10 participants.
                    </p>
                    
                    <div class="alert alert-info">
                        <i class="fas fa-info-circle"></i>
                        All entry fees have been refunded to participants' wallets.
                    </div>

                    <div class="mt-4">
                        <a href="{{ route('admin.performance.index') }}" class="btn btn-primary">
                            <i class="fas fa-arrow-left"></i> Back to Performance List
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
@endsection
