<h1>Transactions</h1>
<table>
    <tr><th>User</th><th>Type</th><th>Amount (Rs)</th><th>Status</th></tr>
    @foreach($transactions as $t)
    <tr>
        <td>{{ $t->user->name }}</td>
        <td>{{ $t->type }}</td>
    <td>₹{{ number_format($t->amount, 2) }}</td>
        <td>{{ $t->status }}</td>
    </tr>
    @endforeach
</table>