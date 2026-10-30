
pipeline {
    agent any

    environment {
        DEPLOY_DIR = '/opt/bug-tracker-frontend'
        APP_PORT = '4173'
    }

    stages {
        stage('Checkout') {
            steps {
                git branch: 'main',
                    url: 'https://github.com/Thamizh51/Bug-Tracker-React.git'
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Build React') {
            steps {
                sh 'npm run build'
            }
        }

        stage('Deploy React') {
            steps {
                sh '''
                    sudo mkdir -p $DEPLOY_DIR

                    sudo rm -rf $DEPLOY_DIR/*

                    sudo cp -r dist/* $DEPLOY_DIR/

                    sudo cp package.json $DEPLOY_DIR/
                    sudo cp package-lock.json $DEPLOY_DIR/

                    sudo cp -r node_modules $DEPLOY_DIR/

                    sudo chown -R jenkins:jenkins $DEPLOY_DIR
                '''
            }
        }

        stage('Run Application') {
            steps {
                sh '''
                    cd $DEPLOY_DIR

                    if [ -f vite-preview.pid ]; then
                        kill $(cat vite-preview.pid) 2>/dev/null || true
                        rm -f vite-preview.pid
                    fi

                    nohup npm run preview -- \
                        --host 0.0.0.0 \
                        --port $APP_PORT \
                        --strictPort \
                        > vite-preview.log 2>&1 &

                    echo $! > vite-preview.pid

                    sleep 5

                    if ! kill -0 $(cat vite-preview.pid) 2>/dev/null; then
                        cat vite-preview.log
                        exit 1
                    fi

                    echo "React application started on port $APP_PORT"
                '''
            }
        }
    }

    post {
        success {
            echo 'Frontend build and deployment completed successfully!'
            echo 'React application: http://YOUR_SERVER_IP:4173'
        }

        failure {
            echo 'Pipeline failed. Check the Jenkins Console Output.'
        }
    }
}
