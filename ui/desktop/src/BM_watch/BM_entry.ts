if (process.env.BM_COMMENT_READER === '1') {
  void import('./BM_commentReader').then(({ BM_runCommentReader }) => BM_runCommentReader());
} else {
  void import('../main');
}
