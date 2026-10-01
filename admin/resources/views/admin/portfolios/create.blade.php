@extends('admin.layouts.app')

@section('content')

<div class="container py-4">
    <div class="row justify-content-center">
        <div class="col-md-8">
            <div class="card shadow-sm border-0">
                <div class="card-header bg-primary text-white">
                    <h4 class="mb-0">Create Portfolio</h4>
                </div>
                <div class="card-body">
                    <form method="POST" action="{{ route('admin.portfolios.store') }}">
                        @csrf

                        <div class="mb-3">
                            <label for="user_id" class="form-label">User</label>
                            <select class="form-select" id="user_id" name="user_id" required>
                                @foreach($users as $user)
                                    <option value="{{ $user->id }}">{{ $user->name }} ({{ $user->email }})</option>
                                @endforeach
                            </select>
                        </div>

                        <div class="mb-3">
                            <label for="contest_id" class="form-label">Contest</label>
                            <select class="form-select" id="contest_id" name="contest_id" required>
                                @foreach($contests as $contest)
                                    <option value="{{ $contest->id }}">{{ $contest->name }} ({{ $contest->type }})</option>
                                @endforeach
                            </select>
                        </div>

                        <div class="mb-3">
                            <label for="total_score" class="form-label">Total Score</label>
                            <input type="number" step="0.01" class="form-control" id="total_score" name="total_score" value="0">
                        </div>

                        <div class="mb-3">
                            <label for="rank" class="form-label">Rank <span class="text-muted">(optional)</span></label>
                            <input type="number" step="1" class="form-control" id="rank" name="rank">
                        </div>

                        <div class="mb-3">
                            <label for="winnings" class="form-label">Winnings</label>
                            <input type="number" step="0.01" class="form-control" id="winnings" name="winnings" value="0">
                        </div>

                        <button type="submit" class="btn btn-success w-100 py-2">Create Portfolio</button>
                    </form>
                </div>
            </div>
        </div>
    </div>
</div>
@endsection