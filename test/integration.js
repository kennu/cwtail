

describe('integration', () => {
  it('cli should be free of syntax errors', () => {
    try {
      require('../cli.js');
      // we're not passing args so cli should always throw. if it
      // doesn't that's a problem
      throw new Error('should not get here');
    }
    catch(err) {
      if (err.message.indexOf('log group name required') > -1) {
        return;
      }
      throw err;
    }
  });
  it('cwtail should be free of syntax errors', () => {
    require('../cwtail.js');
  });
  it('should have proper tests');
});
