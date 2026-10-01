<h1>Create Contest</h1>
<form method="POST" action="{{ route('contests.store') }}">
    @csrf
    <input type="text" name="name" placeholder="Name" />
    <input type="text" name="type" placeholder="stock/crypto" />
    <input type="number" name="entry_fee" placeholder="Entry Fee" />
    <input type="number" name="prize_pool" placeholder="Prize Pool" />
    <input type="datetime-local" name="start_time" />
    <input type="datetime-local" name="end_time" />
    <button type="submit">Create</button>
</form>