@extends('admin.layouts.app')

@section('content')

<div class="container py-4">
    <div class="row justify-content-center">
        <div class="col-md-8">
            <div class="card shadow-sm border-0">
                <div class="card-header bg-primary text-white">
                    <h4 class="mb-0">Edit Portfolio: {{ $portfolio->id }}</h4>
                </div>
                <div class="card-body">
                    <form method="POST" action="{{ route('admin.portfolios.update', $portfolio->id) }}">
                        @csrf
                        @method('PUT')

                        <div class="mb-3">
                            <label for="user_id" class="form-label">User</label>
                            <select class="form-select" id="user_id" name="user_id" required>
                                @foreach($users as $user)
                                    <option value="{{ $user->id }}" {{ old('user_id', $portfolio->user_id) == $user->id ? 'selected' : '' }}>{{ $user->name }} ({{ $user->email }})</option>
                                @endforeach
                            </select>
                        </div>

                        <div class="mb-3">
                            <label for="contest_id" class="form-label">Contest</label>
                            <select class="form-select" id="contest_id" name="contest_id" required>
                                @foreach($contests as $contest)
                                    <option value="{{ $contest->id }}" {{ old('contest_id', $portfolio->contest_id) == $contest->id ? 'selected' : '' }}>{{ $contest->name }} ({{ $contest->type }})</option>
                                @endforeach
                            </select>
                        </div>

                        <div class="mb-3">
                            <label for="total_score" class="form-label">Total Score</label>
                            <input type="number" step="0.01" class="form-control" id="total_score" name="total_score" value="{{ old('total_score', $portfolio->total_score) }}">
                        </div>

                        <div class="mb-3">
                            <label for="rank" class="form-label">Rank <span class="text-muted">(optional)</span></label>
                            <input type="number" step="1" class="form-control" id="rank" name="rank" value="{{ old('rank', $portfolio->rank) }}">
                        </div>

                        <div class="mb-3">
                            <label for="winnings" class="form-label">Winnings</label>
                            <input type="number" step="0.01" class="form-control" id="winnings" name="winnings" value="{{ old('winnings', $portfolio->winnings) }}">
                        </div>

                        <button type="submit" class="btn btn-success w-100 py-2">Update Portfolio</button>
                    </form>
                </div>
            </div>
        </div>
    </div>
</div>
@endsection