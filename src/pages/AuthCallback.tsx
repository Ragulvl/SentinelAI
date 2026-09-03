import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthService } from '../services/auth.service';

// Auth callback — token is now set as an httpOnly cookie by the backend.
// The backend redirects here with NO token in the URL (XSS-safe).
// We just verify the session via the cookie and navigate.
const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const error = searchParams.get('error');

    if (error) {
      console.error('Authentication error:', error);
      navigate('/login?error=' + encodeURIComponent(error));
      return;
    }

    // Cookie was set by backend — verify session (sends cookie automatically)
    AuthService.verifyToken().then((user) => {
      if (user) {
        navigate('/repos');
      } else {
        navigate('/login?error=Authentication failed');
      }
    });
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Completing authentication...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
